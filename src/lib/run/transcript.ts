import { z } from 'zod';
import { parseMoodResponse } from '@/lib/llm/mood';
import { winState } from '@/lib/conversation/win';
import type { WinCondition } from '@/types';

/**
 * Pure rules for an AI vs AI run: who speaks next, how a turn reads in the
 * chat-message shape the rest of the app uses, and when the run is over.
 */

export type RunSide = 'learner' | 'counterpart';
export type RunStatus = 'running' | 'deal' | 'no_deal' | 'limit';

export interface RunTurn {
  side: RunSide;
  content: string;
}

export const DEFAULT_RUN_MAX_MESSAGES = 30;

export const OUTCOME_LABELS: Record<Exclude<RunStatus, 'running'>, string> = {
  deal: 'Deal reached',
  no_deal: 'No deal',
  limit: 'Message limit reached',
};

/** A finished run's result as the report shows it, saved with the run when it ends. */
export type RunResult = 'deal' | 'no_deal' | 'unscored';

export const RESULT_LABELS: Record<RunResult, string> = {
  deal: 'Deal reached',
  no_deal: 'No deal',
  unscored: 'Unscored',
};

/** Unscored when the scenario has no issues; otherwise only an agreement is a deal (the limit counts as no deal). */
export function runResult(status: Exclude<RunStatus, 'running'>, hasIssues: boolean): RunResult {
  if (!hasIssues) return 'unscored';
  return status === 'deal' ? 'deal' : 'no_deal';
}

export function readRunResult(value: string | null | undefined): RunResult | null {
  return value === 'deal' || value === 'no_deal' || value === 'unscored' ? value : null;
}

const transcriptSchema = z.array(z.object({ side: z.enum(['learner', 'counterpart']), content: z.string() }));

export function readTranscript(text: string | null | undefined): RunTurn[] {
  try {
    const parsed = transcriptSchema.safeParse(JSON.parse(text ?? '[]'));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function readRunStatus(value: string): RunStatus {
  return value === 'deal' || value === 'no_deal' || value === 'limit' ? value : 'running';
}

/** The counterpart opens; the You-play side answers; then strictly alternate. */
export function nextSide(transcript: RunTurn[]): RunSide {
  return transcript[transcript.length - 1]?.side === 'counterpart' ? 'learner' : 'counterpart';
}

/** As chat messages: the You-play side is the "user", like a learner on the chat page. */
export function asChatMessages(transcript: RunTurn[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return transcript.map((t) => ({ role: t.side === 'learner' ? 'user' : 'assistant', content: t.content }));
}

/** From the speaking side's point of view: its own turns are "assistant", the other side's are "user". */
export function asMessagesFor(side: RunSide, transcript: RunTurn[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return transcript.map((t) => ({ role: t.side === side ? 'assistant' : 'user', content: t.content }));
}

/** The run's message limit: the scenario's maxMessages, else 30, counted as You-play-side turns. */
export function runWinCondition(condition: WinCondition): WinCondition {
  return { ...condition, maxMessages: condition.maxMessages ?? DEFAULT_RUN_MAX_MESSAGES };
}

export interface TurnReply {
  content: string;
  endsWithoutDeal: boolean;
}

/** A side's reply is the mood JSON plus an optional "endsWithoutDeal" flag. */
export function parseTurnReply(raw: string): TurnReply {
  const { content } = parseMoodResponse(raw);
  return { content: content.trim(), endsWithoutDeal: /"endsWithoutDeal"\s*:\s*true/.test(raw) };
}

export interface TurnFacts {
  /** The transcript including the turn just taken. */
  transcript: RunTurn[];
  condition: WinCondition;
  /** The side that just spoke said it is breaking off without a deal. */
  endsWithoutDeal: boolean;
  /** Deal extraction said both sides agreed (only asked after a counterpart reply). */
  dealReached: boolean;
}

/**
 * Where the run stands after a turn. Order matters: an agreement wins; then the
 * message limit (the limit is reached once the counterpart has answered the last
 * You-play turn, exactly as on the chat page) wins over a break-off; "No deal" only
 * when a side explicitly breaks off before the limit.
 */
export function outcomeAfterTurn({ transcript, condition, endsWithoutDeal, dealReached }: TurnFacts): RunStatus {
  const last = transcript[transcript.length - 1];
  if (!last) return 'running';
  const { limitReached } = winState(asChatMessages(transcript), runWinCondition(condition));
  if (last.side === 'counterpart') {
    if (dealReached) return 'deal';
    if (limitReached) return 'limit';
    return endsWithoutDeal ? 'no_deal' : 'running';
  }
  // The You-play side just spoke; at the limit the counterpart still answers.
  if (limitReached) return 'running';
  return endsWithoutDeal ? 'no_deal' : 'running';
}
