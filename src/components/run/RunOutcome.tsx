'use client';

import { useState } from 'react';
import type { RunStatus } from '@/lib/run/transcript';

const TONE: Record<Exclude<RunStatus, 'running'>, string> = {
  deal: 'bg-green-50 border-green-600 text-green-800 dark:bg-green-950/50 dark:text-green-200',
  no_deal: 'bg-red-50 border-red-600 text-red-800 dark:bg-red-950/50 dark:text-red-200',
  limit: 'bg-amber-50 border-amber-500 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
};

interface RunOutcomeProps {
  status: RunStatus;
  label: string;
  ref?: React.Ref<HTMLDivElement>;
}

/** The end of a run: one loud status line and the See report button. */
export function RunOutcome({ status, label, ref }: RunOutcomeProps) {
  const [reportNote, setReportNote] = useState(false);
  const tone = status === 'running' ? TONE.limit : TONE[status];
  return (
    <div ref={ref} className={`border-t-4 px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${tone}`}>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest opacity-70">Run finished</p>
        <p role="status" data-testid="run-outcome" className="text-3xl font-bold tracking-tight mt-1">
          {label}
        </p>
      </div>
      <div className="flex flex-col items-start sm:items-end gap-1">
        <button
          type="button"
          data-testid="see-report"
          onClick={() => setReportNote(true)}
          className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          See report
        </button>
        {reportNote && <p className="text-xs opacity-80">The report for runs is coming next.</p>}
      </div>
    </div>
  );
}
