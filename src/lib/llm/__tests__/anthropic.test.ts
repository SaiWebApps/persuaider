/**
 * @jest-environment node
 */

/**
 * Tests for the Anthropic LLM provider.
 */

const mockCreate = jest.fn();
const mockStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: mockStream,
    },
  }));
});

jest.mock('../errors', () => ({
  classifyAnthropicError: jest.fn().mockImplementation((err: Error) => err),
}));

jest.mock('../models', () => ({
  LLM_MODELS: { anthropic: 'claude-test-model' },
}));

import { AnthropicProvider } from '../providers/anthropic';
import type { LLMMessage } from '../types';

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new AnthropicProvider('test-api-key');
  });

  it('has name set to "anthropic"', () => {
    expect(provider.name).toBe('anthropic');
  });

  describe('generateResponse', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a test assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    it('returns content from API response', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Hello back!' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      const result = await provider.generateResponse(messages);
      expect(result.content).toBe('Hello back!');
      expect(result.provider).toBe('anthropic');
    });

    it('passes system message separately', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      });

      await provider.generateResponse(messages);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a test assistant.',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );
    });

    it('uses default model when no option provided', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      });

      await provider.generateResponse(messages);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-test-model' })
      );
    });

    it('uses custom model when provided in options', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      });

      await provider.generateResponse(messages, { model: 'custom-model' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'custom-model' })
      );
    });

    it('maps usage tokens correctly', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await provider.generateResponse(messages);
      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('returns empty content when response has no text blocks', async () => {
      mockCreate.mockResolvedValue({
        content: [],
        usage: { input_tokens: 5, output_tokens: 0 },
      });

      const result = await provider.generateResponse(messages);
      expect(result.content).toBe('');
    });

    it('passes temperature and maxTokens options', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      });

      await provider.generateResponse(messages, { temperature: 0.5, maxTokens: 1000 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 1000,
        })
      );
    });

    it('uses default temperature 0.8 and maxTokens 500', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      });

      await provider.generateResponse(messages);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
          max_tokens: 500,
        })
      );
    });

    it('throws classified error on API failure', async () => {
      const apiError = new Error('Rate limited');
      mockCreate.mockRejectedValue(apiError);

      await expect(provider.generateResponse(messages)).rejects.toThrow('Rate limited');
    });

    it('maps assistant role correctly in messages', async () => {
      const mixedMessages: LLMMessage[] = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'How are you?' },
      ];

      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'response' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      });

      await provider.generateResponse(mixedMessages);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello' },
            { role: 'user', content: 'How are you?' },
          ],
        })
      );
    });
  });
});
