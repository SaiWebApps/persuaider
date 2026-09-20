import { z } from 'zod';
import type { LLMFeedback, WinningArgument } from '@/types';

/**
 * Read-path codecs for the JSON-as-text columns on Summary. Lenient: a
 * malformed row renders as empty feedback rather than a 500.
 */

const winningArgumentSchema = z.object({
  text: z.string(),
  framework: z.string().default(''),
  element: z.string().default(''),
  effectiveness: z.number().default(3),
});

const llmFeedbackSchema = z.object({
  whatWentWell: z.array(z.string()).default([]),
  whatToImprove: z.array(z.string()).default([]),
  specificSuggestions: z.array(z.string()).default([]),
});

const frameworkScoresSchema = z.record(z.string(), z.number());

function lenient<T>(schema: z.ZodType<T>, text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

export function readWinningArguments(text: string | null | undefined): WinningArgument[] {
  return lenient(z.array(winningArgumentSchema), text, []);
}

export function readLLMFeedback(text: string | null | undefined): LLMFeedback | null {
  return lenient(llmFeedbackSchema.nullable(), text, null);
}

export function readFrameworkScores(text: string | null | undefined): Record<string, number> | null {
  return lenient(frameworkScoresSchema.nullable(), text, null);
}
