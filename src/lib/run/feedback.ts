import { z } from 'zod';

/**
 * Pure rules for a run's feedback: the AI writes each point as one sentence that
 * quotes a You-play turn; code checks every point before it is saved, so the
 * report only ever shows points that quote the transcript exactly and, on a
 * scored run, name an issue's hidden target or walk-away as the Deal rows show it.
 */

/** A point as saved: the sentence split around its quote (quote marks not included). */
export interface FeedbackPoint {
  before: string;
  quote: string;
  after: string;
}

/** Both lists empty means the feedback could not be written. */
export interface RunFeedback {
  wentWell: FeedbackPoint[];
  goneBetter: FeedbackPoint[];
}

/** One Deal row's hidden figures, written exactly as the report shows them. */
export interface FeedbackFigures {
  issue: string;
  target: string;
  walkAway: string;
}

export const MAX_POINTS = 3;

/** Figures read as on the summary page and the report's Deal rows. */
export function formatFigure(value: number | null, unit?: string): string {
  if (value === null) return '—';
  const n = value.toLocaleString('en-US');
  if (unit === 'USD' || unit === '$') return `$${n}`;
  if (unit === '%') return `${n}%`;
  return unit ? `${n} ${unit}` : n;
}

export function pointText(point: FeedbackPoint): string {
  return `${point.before}"${point.quote}"${point.after}`;
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_]/u.test(ch);

const FORBIDDEN =
  /\b(scores?|scored|scoring|grades?|graded|grading|out of|utility|utilities|reservations?|batna|zopa|anchors?|anchored|anchoring)\b|\/100/i;

/** Whether `quote` is a stretch of `turn` that starts and ends on word boundaries, letter case exact. */
export function quotesTurn(quote: string, turn: string): boolean {
  const text = collapse(turn);
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    const end = at + quote.length;
    const startOk = !isWordChar(quote[0]) || !isWordChar(text[at - 1]);
    const endOk = !isWordChar(quote[quote.length - 1]) || !isWordChar(text[end]);
    if (startOk && endOk) return true;
  }
  return false;
}

function isOneSentence(text: string): boolean {
  if (!text.endsWith('.')) return false;
  const segments = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)].filter((s) => s.segment.trim());
  return segments.length === 1;
}

/** "target $1,900" or "walk-away: $1,600": only spaces or punctuation between, and no further digits after. */
function namesFigure(text: string, word: 'target' | 'walk-away', figure: string): boolean {
  const pattern = new RegExp(`(?<![\\p{L}-])${word}[\\s:;,—–()-]*${escapeRegExp(figure)}(?![\\d]|[.,]\\d)`, 'u');
  return pattern.test(text);
}

/**
 * Checks one sentence from the AI. `figures` is null on an Unscored run: then the
 * point's own words carry no figures at all. Returns the saved shape or why it failed.
 */
export function checkPoint(
  raw: string,
  learnerTurns: string[],
  figures: FeedbackFigures[] | null
): { point: FeedbackPoint } | { problem: string } {
  const sentence = collapse(raw.replace(/[“”]/g, '"'));
  const parts = sentence.split('"');
  if (parts.length !== 3) return { problem: `must contain exactly one quote in straight double quotes: ${sentence}` };
  const [before, rawQuote, after] = parts as [string, string, string];
  const quote = rawQuote.trim();
  if (!quote) return { problem: `the quote is empty: ${sentence}` };
  if (!learnerTurns.some((turn) => quotesTurn(quote, turn))) {
    return { problem: `the quoted words are not copied exactly from one of your side's turns: "${quote}"` };
  }
  const point: FeedbackPoint = { before, quote, after };
  const text = pointText(point);
  if (text.length > 400) return { problem: `too long: ${text}` };
  if (!isOneSentence(`${before}QUOTE${after}`.trim())) return { problem: `must be one sentence ending in a full stop: ${text}` };
  if (FORBIDDEN.test(text)) return { problem: `uses a forbidden word: ${text}` };

  const own = `${before} ${after}`;
  if (figures === null) {
    if (/[\d$€£¥%]/.test(own)) return { problem: `must not contain any figures outside the quote: ${text}` };
    if ((own.match(/\p{L}{2,}/gu) ?? []).length < 3) return { problem: `must explain the quoted turn: ${text}` };
    return { point };
  }

  const named = figures.find(
    (f) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(f.issue)}(?![\\p{L}\\p{N}])`, 'u').test(own) &&
      (namesFigure(own, 'target', f.target) || namesFigure(own, 'walk-away', f.walkAway))
  );
  if (!named) {
    return { problem: `must name an issue and "target" or "walk-away" followed directly by that issue's figure: ${text}` };
  }
  let rest = own;
  for (const piece of [named.issue, named.target, named.walkAway]) rest = rest.split(piece).join(' ');
  rest = rest.replace(/\b(target|walk-away)\b/g, ' ');
  if ((rest.match(/\p{L}{2,}/gu) ?? []).length < 3) return { problem: `must explain what the quoted turn meant: ${text}` };
  return { point };
}

const replySchema = z.object({
  wentWell: z.array(z.string()),
  goneBetter: z.array(z.string()),
});

function parseJson(raw: string): z.infer<typeof replySchema> | null {
  const candidates = [raw.trim(), raw.match(/```json\s*\n?([\s\S]*?)\n?\s*```/)?.[1], raw.match(/\{[\s\S]*\}/)?.[0]];
  for (const text of candidates) {
    if (!text) continue;
    try {
      const parsed = replySchema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** The AI's whole reply passes only when both lists have one to three points and every point passes. */
export function checkFeedbackReply(
  raw: string,
  learnerTurns: string[],
  figures: FeedbackFigures[] | null
): { feedback: RunFeedback } | { problems: string[] } {
  const reply = parseJson(raw);
  if (!reply) return { problems: ['the reply was not the JSON asked for'] };
  const problems: string[] = [];
  const check = (name: string, list: string[]) => {
    if (list.length === 0) problems.push(`"${name}" is empty`);
    if (list.length > MAX_POINTS) problems.push(`"${name}" has more than ${MAX_POINTS} points`);
    return list.flatMap((sentence) => {
      const result = checkPoint(sentence, learnerTurns, figures);
      if ('problem' in result) {
        problems.push(result.problem);
        return [];
      }
      return [result.point];
    });
  };
  const wentWell = check('wentWell', reply.wentWell);
  const goneBetter = check('goneBetter', reply.goneBetter);
  return problems.length ? { problems } : { feedback: { wentWell, goneBetter } };
}

export const NO_FEEDBACK: RunFeedback = { wentWell: [], goneBetter: [] };

const pointSchema = z.object({ before: z.string(), quote: z.string(), after: z.string() });
const feedbackSchema = z.object({ wentWell: z.array(pointSchema), goneBetter: z.array(pointSchema) });

/** The saved feedback; a missing or malformed row reads as "could not be written". */
export function readRunFeedback(text: string | null | undefined): RunFeedback {
  if (!text) return NO_FEEDBACK;
  try {
    const parsed = feedbackSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : NO_FEEDBACK;
  } catch {
    return NO_FEEDBACK;
  }
}
