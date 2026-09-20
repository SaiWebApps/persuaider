import type { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from '../types';

/**
 * A scripted provider for deterministic tests and, later, engine replay.
 * Replies are served in order; when the script runs out, the last reply
 * repeats. Every call is recorded so tests can assert on what was sent.
 */
export class FakeProvider implements LLMProvider {
  name = 'fake';
  readonly calls: Array<{ messages: LLMMessage[]; options?: LLMOptions }> = [];
  private index = 0;

  constructor(private replies: string[] = ['OK'], private model = 'fake-model') {}

  async generateResponse(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    this.calls.push({ messages, options });
    const content = this.replies[Math.min(this.index, this.replies.length - 1)] ?? '';
    this.index += 1;
    const promptTokens = Math.ceil(messages.map((m) => m.content).join('\n').length / 4);
    const completionTokens = Math.ceil(content.length / 4);
    return {
      content,
      provider: this.name,
      model: this.model,
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
    };
  }

  async *generateStreamingResponse(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<string, void, unknown> {
    const { content } = await this.generateResponse(messages, options);
    for (const word of content.split(/(?<=\s)/)) yield word;
  }
}
