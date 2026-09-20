import type { EvaluationCriteria } from '@/types';

/**
 * The overall score is arithmetic, not opinion: the weighted mean of the
 * per-framework scores the evaluator returned, using the scenario's weights.
 *
 * Returns null when nothing can be scored (no framework score matched a
 * framework in the criteria). Callers must show "not scored", never a
 * made-up middle number.
 */
export function weightedOverall(
  frameworkScores: Record<string, number> | null | undefined,
  criteria: EvaluationCriteria
): number | null {
  if (!frameworkScores) return null;
  const byName = new Map<string, number>();
  for (const [name, value] of Object.entries(frameworkScores)) {
    if (typeof value === 'number' && Number.isFinite(value)) byName.set(name.trim().toLowerCase(), value);
  }

  let weighted = 0;
  let totalWeight = 0;
  let matched = 0;
  for (const framework of criteria.frameworks) {
    const score = byName.get(framework.name.trim().toLowerCase());
    if (score === undefined) continue;
    const weight = framework.weight > 0 ? framework.weight : 0;
    weighted += clamp(score, 0, 100) * weight;
    totalWeight += weight;
    matched += 1;
  }

  if (matched === 0) return null;
  if (totalWeight === 0) {
    // All matched weights are zero: fall back to an unweighted mean.
    const values = criteria.frameworks
      .map((f) => byName.get(f.name.trim().toLowerCase()))
      .filter((v): v is number => v !== undefined);
    return Math.round(values.reduce((a, b) => a + clamp(b, 0, 100), 0) / values.length);
  }
  return Math.round(weighted / totalWeight);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
