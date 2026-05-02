import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from '../types';
import { classifyAnthropicError } from '../errors';
import { LLM_MODELS } from '../models';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateResponse(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    try {
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const response = await this.client.messages.create({
        model: options?.model || LLM_MODELS.anthropic,
        max_tokens: options?.maxTokens || 500,
        temperature: options?.temperature ?? 0.8,
        system: systemMessage?.content,
        messages: conversationMessages.map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        })),
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';

      return {
        content,
        provider: this.name,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw classifyAnthropicError(error, this.name);
    }
  }

  async *generateStreamingResponse(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<string, void, unknown> {
    try {
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const stream = this.client.messages.stream({
        model: options?.model || LLM_MODELS.anthropic,
        max_tokens: options?.maxTokens || 500,
        temperature: options?.temperature ?? 0.8,
        system: systemMessage?.content,
        messages: conversationMessages.map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        })),
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } catch (error) {
      throw classifyAnthropicError(error, this.name);
    }
  }
}
