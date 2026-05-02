import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from '../types';
import { classifyOpenAIError } from '../errors';
import { LLM_MODELS } from '../models';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateResponse(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    try {
      // Use hardcoded model (options.model can still override for testing)
      const completion = await this.client.chat.completions.create({
        model: options?.model || LLM_MODELS.openai,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: options?.temperature ?? 0.8,
        max_tokens: options?.maxTokens ?? 500,
      });

      const content = completion.choices[0]?.message?.content || '';

      return {
        content,
        provider: this.name,
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      // Classify the error for proper retry/fallback handling
      throw classifyOpenAIError(error, this.name);
    }
  }

  async *generateStreamingResponse(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<string, void, unknown> {
    try {
      const stream = await this.client.chat.completions.create({
        model: options?.model || LLM_MODELS.openai,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: options?.temperature ?? 0.8,
        max_tokens: options?.maxTokens ?? 500,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    } catch (error) {
      throw classifyOpenAIError(error, this.name);
    }
  }
}
