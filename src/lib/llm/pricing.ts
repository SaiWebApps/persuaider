/**
 * Approximate list prices, USD per 1M tokens, September 2026. Used for the
 * per-user budget, not for billing. Unknown models fall back to a
 * conservative rate so a new model can never be "free".
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-opus-5': { input: 5, output: 25 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gpt-5.2-instant': { input: 2, output: 12 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
};

const FALLBACK = { input: 5, output: 25 };

export function costUsd(model: string | undefined, promptTokens: number, completionTokens: number): number {
  const key = (model ?? '').toLowerCase();
  const price = PRICES[key] ?? Object.entries(PRICES).find(([k]) => key.startsWith(k))?.[1] ?? FALLBACK;
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
}

/** Rough token estimate for streamed calls where the provider did not report usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
