import { z } from 'zod';
import type { EvaluationCriteria, WinCondition, PersonaCharacteristics } from '@/types';
import { ValidationError } from '@/types';

/**
 * One typed codec per JSON-as-text column on Scenario and Persona.
 *
 * Two paths, deliberately different:
 *  - `read*(text)`  is the database read path. It is lenient: malformed or empty
 *    text yields the documented default and never throws, so a bad row cannot
 *    500 a page.
 *  - `parse*Input(value)` is the request write path. It is strict: it throws a
 *    ValidationError whose message names the offending field, and returns the
 *    typed value ready for `serialize`.
 */

// ---------- schemas ----------

const elementSchema = z.object({
  name: z.string({ error: 'name must be a string' }),
  description: z.string({ error: 'description must be a string' }),
});

const frameworkSchema = z.object({
  name: z
    .string({ error: 'name must be a string (1-100 chars)' })
    .min(1, { error: 'name must be a string (1-100 chars)' })
    .max(100, { error: 'name must be a string (1-100 chars)' }),
  description: z.string({ error: 'description must be a string' }),
  elements: z.array(elementSchema, { error: 'elements must be an array' }),
  weight: z
    .number({ error: 'weight must be a number between 0 and 100' })
    .min(0, { error: 'weight must be a number between 0 and 100' })
    .max(100, { error: 'weight must be a number between 0 and 100' }),
});

export const evaluationCriteriaSchema = z.object({
  frameworks: z.array(frameworkSchema, { error: 'frameworks must be an array' }),
  scoringInstructions: z
    .string({ error: 'scoringInstructions must be a string' })
    .max(2000, { error: 'scoringInstructions must be at most 2000 characters' })
    .default(''),
});

export const winConditionSchema = z
  .object({
    type: z.enum(['score_threshold', 'manual'], { error: 'type must be "score_threshold" or "manual"' }),
    threshold: z
      .number({ error: 'threshold must be a number between 1 and 100' })
      .min(1, { error: 'threshold must be a number between 1 and 100' })
      .max(100, { error: 'threshold must be a number between 1 and 100' })
      .optional(),
    maxMessages: z
      .number({ error: 'maxMessages must be a number between 1 and 100' })
      .min(1, { error: 'maxMessages must be a number between 1 and 100' })
      .max(100, { error: 'maxMessages must be a number between 1 and 100' })
      .nullish(),
  })
  .refine((w) => w.type !== 'score_threshold' || typeof w.threshold === 'number', {
    error: 'threshold must be a number between 1 and 100 when type is score_threshold',
    path: ['threshold'],
  });

export const tagsSchema = z
  .array(z.string({ error: 'must be a string' }).max(50, { error: 'must be at most 50 characters' }), {
    error: 'tags must be an array',
  })
  .max(10, { error: 'tags must have at most 10 items' })
  .refine((tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length, {
    error: 'tags contains duplicate',
  });

export const characteristicsSchema = z.object({
  openness: z
    .number({ error: 'openness must be a number between 0 and 1' })
    .min(0, { error: 'openness must be between 0 and 1' })
    .max(1, { error: 'openness must be between 0 and 1' })
    .optional(),
  concerns: z
    .array(z.string({ error: 'concerns must be an array of strings' }), { error: 'concerns must be an array' })
    .max(20, { error: 'concerns cannot exceed 20 items' })
    .optional(),
  personality: z
    .array(z.string({ error: 'personality must be an array of strings' }), { error: 'personality must be an array' })
    .max(10, { error: 'personality cannot exceed 10 items' })
    .optional(),
  roleBehavior: z
    .string({ error: 'roleBehavior must be a string' })
    .max(1000, { error: 'roleBehavior cannot exceed 1000 characters' })
    .optional(),
});

// Read-path variants: each field falls back on its own, so one bad value in a
// legacy row does not throw away the rest of the object.
const readFrameworkSchema = z.object({
  name: z.string().catch('Framework'),
  description: z.string().catch(''),
  elements: z.array(elementSchema).catch([]),
  weight: z.number().min(0).max(100).catch(50),
});
const readEvaluationCriteriaSchema = z.object({
  frameworks: z.array(readFrameworkSchema).catch([]),
  scoringInstructions: z.string().catch(''),
});
const readCharacteristicsSchema = z.object({
  // Legacy rows used a 1–10 scale; map them onto 0–1 instead of dropping them.
  openness: z
    .number()
    .transform((n) => (n > 1 && n <= 10 ? n / 10 : n))
    .pipe(z.number().min(0).max(1))
    .optional()
    .catch(undefined),
  concerns: z.array(z.string()).optional().catch(undefined),
  personality: z.array(z.string()).optional().catch(undefined),
  roleBehavior: z.string().optional().catch(undefined),
});

export const contextNotesSchema = z
  .string({ error: 'contextNotes must be a string or null' })
  .max(5000, { error: 'contextNotes must be at most 5000 characters' })
  .nullable();

export const visibilitySchema = z.enum(['public', 'unlisted'], { error: 'visibility must be "public" or "unlisted"' });

// ---------- defaults ----------

export const DEFAULT_EVALUATION_CRITERIA: EvaluationCriteria = {
  frameworks: [
    {
      name: 'Preparation',
      description: 'Shows they understand the situation, the other side, and their own alternatives.',
      elements: [
        { name: 'Knows the facts', description: 'References specific, relevant information' },
        { name: 'Knows their alternative', description: 'Mentions what they will do if no deal is reached' },
      ],
      weight: 30,
    },
    {
      name: 'Persuasion',
      description: 'Makes a case the counterpart can accept: interests, evidence, and empathy.',
      elements: [
        { name: 'Interests over positions', description: 'Explores why, not just what' },
        { name: 'Evidence', description: 'Backs claims with data or examples' },
        { name: 'Acknowledges concerns', description: 'Names and addresses the other side’s worries' },
      ],
      weight: 40,
    },
    {
      name: 'Deal-making',
      description: 'Anchors sensibly, concedes deliberately, and moves toward a concrete agreement.',
      elements: [
        { name: 'Anchoring', description: 'Opens with a considered first number or proposal' },
        { name: 'Concessions', description: 'Trades rather than gives; concessions shrink over time' },
        { name: 'Closing', description: 'Asks for a specific next step or commitment' },
      ],
      weight: 30,
    },
  ],
  scoringInstructions:
    'Score each framework 0-100 on the trainee’s messages only. A score of 70 or more means a competent professional; 90 or more means exceptional.',
};

export const DEFAULT_WIN_CONDITION: WinCondition = { type: 'manual', maxMessages: 30 };

// ---------- helpers ----------

function formatIssues(column: string, error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue.path.map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`)).join('');
  const withPath = path ? (path.startsWith('[') ? `${column}${path}` : `${column}.${path}`) : column;
  // Messages already name their own leaf field; avoid "name name must be".
  const leaf = String(issue.path[issue.path.length - 1] ?? '');
  const message = issue.message.startsWith(`${leaf} `) ? issue.message.slice(leaf.length + 1) : issue.message;
  return `${withPath} ${message}`.trim();
}

function strict<T>(column: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(formatIssues(column, result.error), column);
  return result.data;
}

function lenient<T>(schema: z.ZodType<T>, text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

function rejectString(column: string, value: unknown): void {
  if (typeof value === 'string') {
    throw new ValidationError(`${column} must be an object, not a string`, column);
  }
}

// ---------- evaluationCriteria ----------

export function readEvaluationCriteria(text: string | null | undefined): EvaluationCriteria {
  const parsed = lenient(readEvaluationCriteriaSchema, text, DEFAULT_EVALUATION_CRITERIA);
  return parsed.frameworks.length > 0 ? parsed : DEFAULT_EVALUATION_CRITERIA;
}

export function parseEvaluationCriteriaInput(value: unknown): EvaluationCriteria {
  rejectString('evaluationCriteria', value);
  return strict('evaluationCriteria', evaluationCriteriaSchema, value);
}

// ---------- winCondition ----------

export function readWinCondition(text: string | null | undefined): WinCondition {
  const parsed = lenient(winConditionSchema, text, DEFAULT_WIN_CONDITION);
  return { ...parsed, maxMessages: parsed.maxMessages ?? undefined };
}

export function parseWinConditionInput(value: unknown): WinCondition {
  rejectString('winCondition', value);
  const parsed = strict('winCondition', winConditionSchema, value);
  return { ...parsed, maxMessages: parsed.maxMessages ?? undefined };
}

// ---------- tags ----------

export function readTags(text: string | null | undefined): string[] {
  return lenient(tagsSchema, text, []);
}

export function parseTagsInput(value: unknown): string[] {
  return strict('tags', tagsSchema, value);
}

// ---------- characteristics ----------

export type PartialCharacteristics = Partial<PersonaCharacteristics>;

export function readCharacteristics(text: string | null | undefined): PartialCharacteristics {
  const parsed = lenient(readCharacteristicsSchema, text, {});
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)) as PartialCharacteristics;
}

export function parseCharacteristicsInput(value: unknown): PartialCharacteristics {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('characteristics must be an object', 'characteristics');
  }
  return strict('characteristics', characteristicsSchema, value);
}

// ---------- scalar inputs that share the same message style ----------

export function parseContextNotesInput(value: unknown): string | null {
  return strict('contextNotes', contextNotesSchema, value);
}

export function parseVisibilityInput(value: unknown): 'public' | 'unlisted' {
  return strict('visibility', visibilitySchema, value);
}

// ---------- serialize ----------

export function serialize(value: EvaluationCriteria | WinCondition | string[] | PartialCharacteristics | Issue[]): string {
  return JSON.stringify(value);
}

// ---------- issues ----------

const sideSchema = z.object({
  target: z.number({ error: 'target must be a number' }),
  reservation: z.number({ error: 'reservation must be a number' }),
  weight: z
    .number({ error: 'weight must be a number between 0 and 100' })
    .min(0, { error: 'weight must be a number between 0 and 100' })
    .max(100, { error: 'weight must be a number between 0 and 100' })
    .default(100),
});

export const issueSchema = z.object({
  name: z.string({ error: 'name must be a string (1-100 chars)' }).min(1).max(100),
  unit: z.string().max(20).optional(),
  /** Which direction is better for the learner on this issue. */
  learnerWants: z.enum(['higher', 'lower'], { error: 'learnerWants must be "higher" or "lower"' }),
  learner: sideSchema,
  counterpart: sideSchema,
});

export const issueWithDirectionSchema = issueSchema.superRefine((i, ctx) => {
  const ok = (side: { target: number; reservation: number }, wantsHigher: boolean) =>
    wantsHigher ? side.target >= side.reservation : side.target <= side.reservation;
  if (!ok(i.learner, i.learnerWants === 'higher')) {
    ctx.addIssue({ code: 'custom', path: ['learner'], message: `learner target must be ${i.learnerWants === 'higher' ? 'at least' : 'at most'} the reservation when learnerWants is "${i.learnerWants}"` });
  }
  if (!ok(i.counterpart, i.learnerWants === 'lower')) {
    ctx.addIssue({ code: 'custom', path: ['counterpart'], message: `counterpart target must be ${i.learnerWants === 'lower' ? 'at least' : 'at most'} the reservation when learnerWants is "${i.learnerWants}"` });
  }
});

export const issuesSchema = z
  .array(issueWithDirectionSchema, { error: 'issues must be an array' })
  .max(10, { error: 'issues must have at most 10 items' })
  .refine((list) => new Set(list.map((i) => i.name.trim().toLowerCase())).size === list.length, { error: 'issues contains duplicate names' });

export type Issue = z.infer<typeof issueSchema>;

export function readIssues(text: string | null | undefined): Issue[] {
  return lenient(issuesSchema, text, []);
}

export function parseIssuesInput(value: unknown): Issue[] {
  return strict('issues', issuesSchema, value);
}
