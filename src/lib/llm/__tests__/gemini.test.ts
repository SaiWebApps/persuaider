/**
 * @jest-environment node
 */

/**
 * Tests for the Gemini LLM provider.
 */

const mockSendMessage = jest.fn();
const mockSendMessageStream = jest.fn();
const mockStartChat = jest.fn().mockReturnValue({
  sendMessage: mockSendMessage,
  sendMessageStream: mockSendMessageStream,
});
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  startChat: mockStartChat,
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

jest.mock('../errors', () => ({
  classifyGeminiError: jest.fn().mockImplementation((err: Error) => err),
}));

jest.mock('../models', () => ({
  LLM_MODELS: { gemini: 'gemini-test-model' },
}));

import { GeminiProvider } from '../providers/gemini';
import type { LLMMessage } from '../types';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GeminiProvider('test-api-key');
  });

  it('has name set to "gemini"', () => {
    expect(provider.name).toBe('gemini');
  });

  describe('generateResponse', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a test assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    it('returns content from API response', async () => {
      mockSendMessage.mockResolvedValue({
        response: {
          text: () => 'Hello from Gemini!',
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        },
      });

      const result = await provider.generateResponse(messages);
      expect(result.content).toBe('Hello from Gemini!');
      expect(result.provider).toBe('gemini');
    });

    it('passes system instruction to startChat', async () => {
      mockSendMessage.mockResolvedValue({
        response: {
          text: () => 'response',
          usageMetadata: null,
        },
      });

      await provider.generateResponse(messages);

      expect(mockStartChat).toHaveBeenCalledWith(
        expect.objectContaining({
          systemInstruction: 'You are a test assistant.',
        })
      );
    });

    it('sends last message content via sendMessage', async () => {
      mockSendMessage.mockResolvedValue({
        response: {
          text: () => 'response',
          usageMetadata: null,
        },
      });

      await provider.generateResponse(messages);

      expect(mockSendMessage).toHaveBeenCalledWith('Hello');
    });

    it('maps usage metadata correctly', async () => {
      mockSendMessage.mockResolvedValue({
        response: {
          text: () => 'response',
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            totalTokenCount: 150,
          },
        },
      });

      const result = await provider.generateResponse(messages);
      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('returns undefined usage when no metadata is present', async () => {
      mockSendMessage.mockResolvedValue({
        response: {
          text: () => 'response',
          usageMetadata: null,
        },
      });

      const result = await provider.generateResponse(messages);
      expect(result.usage).toBeUndefined();
    });

    it('throws when no messages are provided', async () => {
      const emptyMessages: LLMMessage[] = [
        { role: 'system', content: 'System only' },
      ];

      // Only system message means no conversation messages, last message is undefined
      await expect(provider.generateResponse(emptyMessages)).rejects.toThrow('No messages to send');
    });

    it('converts assistant role to "model" in history', async () => {
      const mixedMessages: LLMMessage[] = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'How are you?' },
      ];

      mockSendMessage.mockResolvedValue({
        response: { text: () => 'response', usageMetadata: null },
      });

      await provider.generateResponse(mixedMessages);

      expect(mockStartChat).toHaveBeenCalledWith(
        expect.objectContaining({
          history: [
            { role: 'user', parts: [{ text: 'Hi' }] },
            { role: 'model', parts: [{ text: 'Hello' }] },
          ],
        })
      );
    });

    it('throws classified error on API failure', async () => {
      const apiError = new Error('Gemini quota exceeded');
      mockSendMessage.mockRejectedValue(apiError);

      await expect(provider.generateResponse(messages)).rejects.toThrow('Gemini quota exceeded');
    });
  });
});
