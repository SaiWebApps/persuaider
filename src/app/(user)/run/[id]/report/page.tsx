import Link from 'next/link';
import { auth } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import { getRunReport } from '@/lib/run/run';
import { RESULT_LABELS, type RunResult } from '@/lib/run/transcript';
import { RunMessage } from '@/components/run/RunMessage';
import { NotFoundError } from '@/types';

// Reads per-request run data from the database; opt out of static prerendering.
export const dynamic = 'force-dynamic';

const TONE: Record<RunResult, string> = {
  deal: 'text-green-700 dark:text-green-300',
  no_deal: 'text-red-700 dark:text-red-300',
  unscored: 'text-slate-600 dark:text-gray-300',
};

export default async function RunReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  let report;
  try {
    report = await getRunReport(id, session.user.id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  // A run still going has no report yet; send the viewer back to watch it.
  if (!report) redirect(`/run/${id}`);

  const sideLabel = (side: 'learner' | 'counterpart') =>
    side === 'learner' ? `${report.learnerSide} (You play)` : report.counterpartSide;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-900 dark:text-gray-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-7 py-8 flex flex-col gap-4">
        <Link href={`/run/${report.id}`} className="text-sm text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100 w-fit">
          ← Back to the run
        </Link>

        <header>
          <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500 dark:text-gray-400">Run report</p>
          <h1 data-testid="report-title" className="text-2xl font-semibold tracking-tight mt-1">
            {report.scenarioTitle}
          </h1>
          <p data-testid="report-result" className={`text-3xl font-bold tracking-tight mt-2 ${TONE[report.result]}`}>
            {RESULT_LABELS[report.result]}
          </p>
        </header>

        <section aria-labelledby="report-turns-heading" className="flex flex-col gap-3">
          <h2 id="report-turns-heading" className="text-sm font-semibold text-slate-600 dark:text-gray-300">
            Turns ({report.turns.length})
          </h2>
          <ol data-testid="report-turns" className="flex flex-col gap-3">
            {report.turns.map((turn, i) => (
              <li key={i} className={turn.side === 'learner' ? 'sm:pl-16' : 'sm:pr-16'}>
                <RunMessage side={turn.side} label={sideLabel(turn.side)} content={turn.content} />
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
