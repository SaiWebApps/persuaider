import type { LLMProvider, LLMMessage, LLMResponse } from '../types';

/**
 * The scripted AI stand-in for acceptance runs. A test sends a script once
 * (POST /api/scripted-ai); from then on every AI request in that server is
 * answered from it and no real AI is called. Nothing is remembered between
 * requests: a run's turn number alone picks the line, so every run starts
 * again from the first line.
 */

export interface AiScript {
  turns: string[];
  feedback?: { wentWell: string[]; goneBetter: string[] };
}

/** The app is running under scripts/peeraxis/demo.sh (the acceptance script). */
export function isAcceptanceRun(): boolean {
  return process.env.PEERAXIS_ACCEPTANCE === '1';
}

// Kept on globalThis so every route bundle in the server process sees the same script.
const store = globalThis as typeof globalThis & { __persuaiderAiScript?: AiScript | null };

export function getAiScript(): AiScript | null {
  return store.__persuaiderAiScript ?? null;
}

export function setAiScript(script: AiScript | null): void {
  store.__persuaiderAiScript = script;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** The script a request body describes, or null when the body is not a valid script. */
export function readAiScript(body: unknown): AiScript | null {
  if (!body || typeof body !== 'object') return null;
  const { turns, feedback } = body as { turns?: unknown; feedback?: unknown };
  if (!isStringList(turns) || turns.length === 0 || turns.some((t) => !t.trim())) return null;
  if (feedback === undefined || feedback === null) return { turns };
  const { wentWell, goneBetter } = feedback as { wentWell?: unknown; goneBetter?: unknown };
  if (typeof feedback !== 'object' || !isStringList(wentWell) || !isStringList(goneBetter)) return null;
  return { turns, feedback: { wentWell, goneBetter } };
}

const FEEDBACK_PROMPT = 'You are a negotiation coach writing short feedback';
const DEAL_PROMPT = 'You are reading a negotiation transcript';

export class ScriptedProvider implements LLMProvider {
  name = 'scripted';

  constructor(private readonly script: AiScript) {}

  private answer(messages: LLMMessage[]): string {
    const opening = messages[0]?.content ?? '';
    if (opening.startsWith(FEEDBACK_PROMPT)) {
      return JSON.stringify(this.script.feedback ?? { wentWell: [], goneBetter: [] });
    }
    if (opening.startsWith(DEAL_PROMPT)) return JSON.stringify({ reached: false, terms: [] });
    // A turn: the transcript after the greeting picks the line; the last line repeats.
    const spoken = messages.filter((m) => m.role !== 'system').length;
    const line = this.script.turns[Math.min(Math.max(spoken - 1, 0), this.script.turns.length - 1)] ?? '';
    return JSON.stringify({ mood: 'neutral', endsWithoutDeal: false, content: line });
  }

  async generateResponse(messages: LLMMessage[]): Promise<LLMResponse> {
    return {
      content: this.answer(messages),
      provider: this.name,
      model: 'scripted',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  async *generateStreamingResponse(messages: LLMMessage[]): AsyncGenerator<string, void, unknown> {
    yield this.answer(messages);
  }
}
