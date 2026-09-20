import type { WinCondition } from '@/types';

/**
 * Where a conversation stands against its Scenario's win condition.
 * Pure: callers pass the messages and the parsed condition.
 */
export interface WinState {
  userTurns: number;
  maxMessages: number | null;
  remaining: number | null;
  limitReached: boolean;
  scoreThreshold: number | null;
}

export function winState(messages: Array<{ role: string }>, condition: WinCondition): WinState {
  const userTurns = messages.filter((m) => m.role === 'user').length;
  const maxMessages = condition.maxMessages ?? null;
  const remaining = maxMessages === null ? null : Math.max(0, maxMessages - userTurns);
  return {
    userTurns,
    maxMessages,
    remaining,
    limitReached: maxMessages !== null && userTurns >= maxMessages,
    scoreThreshold: condition.type === 'score_threshold' && typeof condition.threshold === 'number' ? condition.threshold : null,
  };
}
