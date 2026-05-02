/**
 * @jest-environment node
 */

/**
 * Tests for the OpenAI LLM provider.
 */

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
});

jest.mock('../errors', () => ({
  classifyOpenAIError: jest.fn().mockImplementation((err: Error) => err),
}));

jest.mock('../models', () => ({
  LLM_MODELS: { openai: 'gpt-test-model' },
}));

import { OpenAIProvider } from '../providers/openai';
import type { LLMMessage } from '../types';

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new OpenAIProvider('test-api-key');
  });

  it('has name set to "openai"', () => {
    expect(provider.name).toBe('openai');
  });

  describe('generateResponse', () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a test assistant.' },
      { role: 'user', content: 'Hello' },
    ];

    it('returns content from API response', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Hello from OpenAI!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });

      const result = await provider.generateResponse(messages);
      expect(result.content).toBe('Hello from OpenAI!');
      expect(result.provider).toBe('openai');
    });

    it('passes all messages including system to the API', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      });

      await provider.generateResponse(messages);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a test assistant.' },
            { role: 'user', content: 'Hello' },
          ],
        })
      );
    });

    it('uses default model when no option provided', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      });

      await provider.generateResponse(messages);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-test-model' })
      );
    });

    it('uses custom model when provided', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      });

      await provider.generateResponse(messages, { model: 'gpt-4-turbo' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4-turbo' })
      );
    });

    it('maps usage tokens correctly', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const result = await provider.generateResponse(messages);
      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('returns undefined usage when API provides no usage data', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
        usage: null,
      });

      const result = await provider.generateResponse(messages);
      expect(result.usage).toBeUndefined();
    });

    it('returns empty content when choices are empty', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: null,
      });

      const result = await provider.generateResponse(messages);
      expect(result.content).toBe('');
    });

    it('passes temperature and max_tokens options', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
        usage: null,
      });

      await provider.generateResponse(messages, { temperature: 0.3, maxTokens: 2000 });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.3,
          max_tokens: 2000,
        })
      );
    });

    it('throws classified error on API failure', async () => {
      const apiError = new Error('API key invalid');
      mockCreate.mockRejectedValue(apiError);

      await expect(provider.generateResponse(messages)).rejects.toThrow('API key invalid');
    });
  });
});
