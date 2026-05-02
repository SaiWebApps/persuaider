import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';
import type { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from '../types';
import { classifyGeminiError } from '../errors';
import { LLM_MODELS } from '../models';

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({ model: LLM_MODELS.gemini });
  }

  async generateResponse(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    try {
      // Use hardcoded model (options.model can still override for testing)
      const modelName = options?.model || LLM_MODELS.gemini;
      const model = this.client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: options?.temperature ?? 0.8,
          maxOutputTokens: options?.maxTokens ?? 500,
        },
      });

      // Separate system message from conversation
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Convert messages to Gemini format
      const contents: Content[] = conversationMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      // Start chat with system instruction if present
      const chat = model.startChat({
        history: contents.slice(0, -1),
        systemInstruction: systemMessage ? systemMessage.content : undefined,
      });

      // Get the last message (which should be from user)
      const lastMessage = conversationMessages[conversationMessages.length - 1];
      if (!lastMessage) {
        throw new Error('No messages to send');
      }

      const result = await chat.sendMessage(lastMessage.content);
      const response = result.response;
      const content = response.text();

      // Gemini provides token counts in usageMetadata
      const usageMetadata = response.usageMetadata;

      return {
        content,
        provider: this.name,
        usage: usageMetadata ? {
          promptTokens: usageMetadata.promptTokenCount || 0,
          completionTokens: usageMetadata.candidatesTokenCount || 0,
          totalTokens: usageMetadata.totalTokenCount || 0,
        } : undefined,
      };
    } catch (error) {
      // Classify the error for proper retry/fallback handling
      throw classifyGeminiError(error, this.name);
    }
  }

  async *generateStreamingResponse(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<string, void, unknown> {
    try {
      const modelName = options?.model || LLM_MODELS.gemini;
      const model = this.client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: options?.temperature ?? 0.8,
          maxOutputTokens: options?.maxTokens ?? 500,
        },
      });

      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      const contents: Content[] = conversationMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const chat = model.startChat({
        history: contents.slice(0, -1),
        systemInstruction: systemMessage ? systemMessage.content : undefined,
      });

      const lastMessage = conversationMessages[conversationMessages.length - 1];
      if (!lastMessage) throw new Error('No messages to send');

      const result = await chat.sendMessageStream(lastMessage.content);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield text;
      }
    } catch (error) {
      throw classifyGeminiError(error, this.name);
    }
  }
}
