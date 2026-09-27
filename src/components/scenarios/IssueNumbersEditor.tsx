'use client';

import type { GeneratedIssue } from '@/types';

/**
 * Editable hidden numbers per issue, with the deal zone computed live so the
 * author can see whether a deal is possible and whether targets sit on the
 * right side of the walk-aways. Used by the generation preview and the editor.
 *
 * 'error' is numbers the API rejects, so callers must block saving on it.
 * 'warning' is numbers the API accepts but the author probably wants to know
 * about: walk-aways that leave no room for a deal are a legitimate scenario.
 */
export type IssueZone = { text: string; severity: 'ok' | 'warning' | 'error' };

export function issueZone(issue: GeneratedIssue): IssueZone {
  const higher = issue.learnerWants === 'higher';
  const zoneLow = higher ? issue.learner.reservation : issue.counterpart.reservation;
  const zoneHigh = higher ? issue.counterpart.reservation : issue.learner.reservation;
  const directionOk = higher
    ? issue.learner.target >= issue.learner.reservation && issue.counterpart.target <= issue.counterpart.reservation
    : issue.learner.target <= issue.learner.reservation && issue.counterpart.target >= issue.counterpart.reservation;
  if (!directionOk) return { text: 'Targets must be on the right side of the walk-aways', severity: 'error' };
  if (zoneLow <= zoneHigh) return { text: `Deal zone: ${zoneLow.toLocaleString('en-US')} – ${zoneHigh.toLocaleString('en-US')}`, severity: 'ok' };
  return { text: 'No overlap: no deal is possible with these limits', severity: 'warning' };
}

export function IssueNumbersEditor({
  issues,
  onChange,
  idPrefix = 'issue',
  editableIssues = false,
}: {
  issues: GeneratedIssue[];
  onChange: (issues: GeneratedIssue[]) => void;
  idPrefix?: string;
  editableIssues?: boolean;
}) {
  const setNumber = (idx: number, side: 'learner' | 'counterpart', key: 'target' | 'reservation', value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    onChange(issues.map((it, i) => (i === idx ? { ...it, [side]: { ...it[side], [key]: n } } : it)));
  };

  return (
    <div className="space-y-3">
      {issues.map((issue, idx) => {
        const zone = issueZone(issue);
        const field = (side: 'learner' | 'counterpart', key: 'target' | 'reservation') => (
          <label className="flex flex-col text-xs text-gray-600 dark:text-gray-400">
            {side === 'learner' ? 'Your' : 'Their'} {key === 'target' ? 'target' : 'walk-away'}
            <input
              type="number"
              value={issue[side][key]}
              onChange={(e) => setNumber(idx, side, key, e.target.value)}
              data-testid={`${idPrefix}-${idx}-${side}-${key}`}
              className="mt-1 w-28 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </label>
        );
        return (
          <div key={idx} className="p-2 border border-gray-200 dark:border-gray-600 rounded text-sm" data-testid={`${idPrefix}-${idx}`}>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {editableIssues ? (
                <div className="flex flex-wrap items-end gap-3">
                  {(['name', 'unit'] as const).map((key) => (
                    <label key={key} className="flex flex-col text-xs">
                      {key === 'name' ? 'Issue name' : 'Unit'}
                      <input
                        value={issue[key] ?? ''}
                        maxLength={key === 'name' ? 100 : 20}
                        onChange={(e) => onChange(issues.map((it, i) => i === idx ? { ...it, [key]: e.target.value } : it))}
                        data-testid={`${idPrefix}-${idx}-${key}`}
                        className="mt-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </label>
                  ))}
                  <button type="button" onClick={() => onChange(issues.filter((_, i) => i !== idx))} data-testid={`remove-${idPrefix}-${idx}`} className="text-sm text-red-700 dark:text-red-300">
                    Remove Issue
                  </button>
                </div>
              ) : <>{issue.name}{issue.unit ? <span className="text-gray-500 dark:text-gray-400 ml-1">({issue.unit})</span> : null}</>}
              <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">you want it {issue.learnerWants}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {field('learner', 'target')}
              {field('learner', 'reservation')}
              {field('counterpart', 'target')}
              {field('counterpart', 'reservation')}
            </div>
            <p className={`mt-2 text-xs ${zone.severity === 'ok' ? 'text-gray-600 dark:text-gray-400' : 'text-amber-700 dark:text-amber-300'}`} data-testid={`${idPrefix}-${idx}-zone`}>
              {zone.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
