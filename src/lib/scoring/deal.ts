import type { Issue } from '@/lib/codec/scenario';

/**
 * What the transcript said about each issue, as extracted by the model.
 * Numbers are in the issue's unit. Missing means "never stated".
 */
export interface DealTerm {
  issue: string;
  agreed?: number | null;
  learnerLastAsk?: number | null;
  counterpartLastOffer?: number | null;
}

export interface DealState {
  reached: boolean;
  terms: DealTerm[];
}

export interface IssueOutcome {
  name: string;
  unit?: string;
  learnerWants: 'higher' | 'lower';
  agreed: number | null;
  learnerLastAsk: number | null;
  counterpartLastOffer: number | null;
  learnerTarget: number;
  learnerReservation: number;
  counterpartTarget: number;
  counterpartReservation: number;
  /** 0–100: where the agreed value sits between the learner's walk-away (0) and target (100). */
  learnerCapture: number | null;
  /** Whether the agreed value respects both sides' walk-away limits. */
  withinBothLimits: boolean | null;
  /** How much of the counterpart's room the learner left on the table, in the issue's unit. */
  leftOnTable: number | null;
}

export interface DealOutcome {
  reached: boolean;
  issues: IssueOutcome[];
  /** Weighted mean of learnerCapture across issues with an agreed value; null if none. */
  learnerUtility: number | null;
}

const EMPTY: DealOutcome = { reached: false, issues: [], learnerUtility: null };

export function computeDealOutcome(state: DealState | null | undefined, issues: Issue[]): DealOutcome {
  if (issues.length === 0) return EMPTY;
  const terms = new Map((state?.terms ?? []).map((t) => [t.issue.trim().toLowerCase(), t]));

  const outcomes: IssueOutcome[] = issues.map((issue) => {
    const term = terms.get(issue.name.trim().toLowerCase());
    const agreed = state?.reached ? numberOrNull(term?.agreed) : null;
    const higher = issue.learnerWants === 'higher';
    const lTarget = issue.learner.target;
    const lReserve = issue.learner.reservation;
    const cReserve = issue.counterpart.reservation;

    let learnerCapture: number | null = null;
    let withinBothLimits: boolean | null = null;
    let leftOnTable: number | null = null;
    if (agreed !== null) {
      const range = lTarget - lReserve;
      learnerCapture = range === 0 ? 100 : clamp(Math.round(((agreed - lReserve) / range) * 100), 0, 100);
      withinBothLimits = higher ? agreed >= lReserve && agreed <= cReserve : agreed <= lReserve && agreed >= cReserve;
      leftOnTable = higher ? Math.max(0, cReserve - agreed) : Math.max(0, agreed - cReserve);
    }

    return {
      name: issue.name,
      unit: issue.unit,
      learnerWants: issue.learnerWants,
      agreed,
      learnerLastAsk: numberOrNull(term?.learnerLastAsk),
      counterpartLastOffer: numberOrNull(term?.counterpartLastOffer),
      learnerTarget: lTarget,
      learnerReservation: lReserve,
      counterpartTarget: issue.counterpart.target,
      counterpartReservation: cReserve,
      learnerCapture,
      withinBothLimits,
      leftOnTable,
    };
  });

  const scored = outcomes
    .map((o, i) => ({ capture: o.learnerCapture, weight: issues[i].learner.weight }))
    .filter((x): x is { capture: number; weight: number } => x.capture !== null);
  const totalWeight = scored.reduce((a, x) => a + x.weight, 0);
  const learnerUtility =
    scored.length === 0
      ? null
      : totalWeight === 0
        ? Math.round(scored.reduce((a, x) => a + x.capture, 0) / scored.length)
        : Math.round(scored.reduce((a, x) => a + x.capture * x.weight, 0) / totalWeight);

  return { reached: Boolean(state?.reached), issues: outcomes, learnerUtility };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
