import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/client';
import Link from 'next/link';
import { readDealOutcome, readFrameworkScores, readLLMFeedback, readWinningArguments } from '@/lib/codec/summary';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ReattemptButton } from '@/components/summary/ReattemptButton';
import { FeltRealPrompt } from '@/components/summary/FeltRealPrompt';
import { readWinCondition } from '@/lib/codec/scenario';

interface SummaryPageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = { title: 'Summary · Persuaider' };

export default async function SummaryPage({ params }: SummaryPageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  // Get conversation with summary
  const conversation = await prisma.conversation.findFirst({
    where: {
      personaId: id,
      userId: session.user.id,
      status: 'completed',
    },
    include: {
      persona: {
        select: {
          name: true,
          description: true,
        },
      },
      scenario: {
        select: {
          title: true,
          userRole: true,
          aiRole: true,
          winCondition: true,
        },
      },
      summary: true,
      role: { select: { name: true } },
    },
    orderBy: {
      completedAt: 'desc',
    },
  });

  if (!conversation || !conversation.summary) {
    redirect('/dashboard');
  }

  const winningArguments = readWinningArguments(conversation.summary.winningArguments);
  const llmFeedback = readLLMFeedback(conversation.summary.llmFeedback);
  const frameworkScores = readFrameworkScores(conversation.summary.frameworkScores);
  const deal = readDealOutcome(conversation.summary.deal);

  // The counterpart's hidden limit is revealed from the learner's second completed
  // attempt with this persona onward, so the first play is not spoiled for a replay.
  // Issues (and so the limit) are per scenario, so the count is per scenario, and
  // only sessions where the learner actually said something count as attempts.
  const completedAttempts = await prisma.conversation.count({
    where: { scenarioId: conversation.scenarioId, userId: session.user.id, status: 'completed', messages: { some: { role: 'user' } } },
  });
  const revealLimit = completedAttempts >= 2;
  const winCondition = readWinCondition(conversation.scenario.winCondition);
  const threshold = winCondition.type === 'score_threshold' ? (winCondition.threshold ?? null) : null;

  const fmt = (value: number | null, unit?: string) => {
    if (value === null) return '—';
    const n = value.toLocaleString('en-US');
    if (unit === 'USD' || unit === '$') return `$${n}`;
    if (unit === '%') return `${n}%`;
    return unit ? `${n} ${unit}` : n;
  };

  const scored = conversation.summary.overallScore != null;
  const hasDeal = !!deal && deal.issues.length > 0;

  const feedbackLists = llmFeedback
    ? [
        { title: 'What Went Well', testId: 'went-well', items: llmFeedback.whatWentWell },
        { title: 'What To Improve', testId: 'to-improve', items: llmFeedback.whatToImprove },
        { title: 'Suggestions', testId: 'suggestions', items: llmFeedback.specificSuggestions },
      ].filter((list) => list.items.length > 0)
    : [];

  const sectionHeading = 'text-2xl sm:text-3xl font-bold leading-none tracking-[-0.02em] [font-stretch:72%]';
  const rowLabel = 'py-2 pr-4 text-left align-baseline text-px-ink-2';
  const rowFigure = 'py-2 text-right align-baseline whitespace-nowrap tabular-nums';

  return (
    <div className="min-h-screen bg-px-paper text-px-ink">
      <nav className="border-b-2 border-px-ink px-4 py-2 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-[0.06em] text-px-ink-2">Summary</span>
          <ThemeToggle />
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        {/* Verdict: who, what, the score and whether a deal was reached */}
        <section className="grid gap-6 bg-px-field p-5 text-px-on sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-8">
          <div className="min-w-0">
            <h1
              className="text-4xl font-bold leading-none tracking-[-0.02em] [font-stretch:72%] sm:text-6xl break-words"
              data-testid="counterpart-name"
            >
              {conversation.persona.name}
            </h1>
            <p className="mt-3 font-serif text-lg" data-testid="scenario-title">
              {conversation.scenario.title}
            </p>
            {conversation.role && (
              <p className="mt-1 text-sm font-bold uppercase tracking-[0.06em] text-px-on-2" data-testid="played-as">
                You played: {conversation.role.name}
              </p>
            )}
          </div>

          <div className="sm:text-right">
            {scored ? (
              <>
                <p className="leading-none tabular-nums" data-testid="score">
                  <span className="text-7xl font-bold tracking-[-0.03em] [font-stretch:72%] sm:text-8xl" data-testid="overall-score">{conversation.summary.overallScore}</span><span className="text-2xl text-px-on-2">/100</span>
                </p>
                <p className="mt-1 text-xs text-px-on-2">Weighted from the framework scores below</p>
              </>
            ) : (
              <div data-testid="not-scored">
                <p className="text-3xl font-bold [font-stretch:72%]">Not scored</p>
                <p className="mt-1 max-w-xs text-xs text-px-on-2">The evaluator did not return usable framework scores for this session.</p>
              </div>
            )}
            {hasDeal && (
              <p
                className={`mt-3 inline-block px-3 py-1 text-sm font-bold ${deal.reached ? 'bg-px-cloth text-px-on-cloth' : 'border-2 border-px-on-2 text-px-on'}`}
                data-testid="deal-status"
              >
                {deal.reached ? 'Deal reached' : 'No deal'}
              </p>
            )}
            {threshold !== null && conversation.summary.overallScore != null && (
              <p className="mt-2 text-sm text-px-on-2" data-testid="win-condition">
                Target score {threshold} (by the evaluator&apos;s score):{' '}
                <span className="font-bold text-px-on">
                  {conversation.summary.overallScore >= threshold ? 'met' : 'not met'}
                </span>
              </p>
            )}
          </div>
        </section>

        <FeltRealPrompt conversationId={conversation.id} initial={conversation.summary.feltReal ?? null} />

        {conversation.persona.description && (
          <p className="mt-8 max-w-[65ch] font-serif text-lg leading-relaxed">{conversation.persona.description}</p>
        )}

        {/* Deal outcome: one ruled table per issue */}
        {hasDeal && (
          <section className="mt-10" data-testid="deal-outcome">
            <h2 className={sectionHeading}>Deal</h2>
            <div className="mt-4 grid gap-8 md:grid-cols-2">
              {deal.issues.map((issue) => (
                <div key={issue.name} className="min-w-0">
                  <table className="w-full border-collapse border-y-2 border-px-ink font-serif" data-testid="deal-issue">
                    <caption className="text-left">
                      <span className="flex items-baseline justify-between gap-4 pb-2">
                        <span className="font-sans font-bold" data-testid="deal-issue-name">{issue.name}</span>
                        <span className="text-2xl font-semibold tabular-nums text-px-cloth dark:text-px-ink" data-testid="deal-agreed">
                          {issue.agreed !== null ? fmt(issue.agreed, issue.unit) : 'No agreement'}
                        </span>
                      </span>
                    </caption>
                    <tbody>
                      <tr data-testid="deal-row">
                        <td className={rowLabel}>Your target</td>
                        <td className={rowFigure}>{fmt(issue.learnerTarget, issue.unit)}</td>
                      </tr>
                      <tr className="border-t border-px-paper-2" data-testid="deal-row">
                        <td className={rowLabel}>Your walk-away</td>
                        <td className={rowFigure}>{fmt(issue.learnerReservation, issue.unit)}</td>
                      </tr>
                      <tr className="border-t border-px-paper-2" data-testid="deal-row">
                        <td className={rowLabel}>Their hidden limit</td>
                        <td
                          className={revealLimit ? rowFigure : 'py-2 text-right align-baseline italic text-px-ink-2'}
                          data-testid="hidden-limit"
                        >
                          {revealLimit ? fmt(issue.counterpartReservation, issue.unit) : 'Revealed after your second attempt'}
                        </td>
                      </tr>
                      <tr className="border-t border-px-paper-2" data-testid="deal-row">
                        <td className={rowLabel}>Your last ask / their last offer</td>
                        <td className={rowFigure}>
                          {fmt(issue.learnerLastAsk, issue.unit)} / {fmt(issue.counterpartLastOffer, issue.unit)}
                        </td>
                      </tr>
                      {issue.learnerCapture !== null && (
                        <tr className="border-t border-px-paper-2" data-testid="deal-row">
                          <td className={rowLabel}>Share of your range captured</td>
                          <td className={rowFigure}>{issue.learnerCapture}%</td>
                        </tr>
                      )}
                      {revealLimit && issue.leftOnTable !== null && issue.leftOnTable > 0 && (
                        <tr className="border-t border-px-paper-2 bg-amber-100 dark:bg-amber-950/50" data-testid="deal-row">
                          <td className="py-2 pr-4 text-left align-baseline font-semibold text-amber-900 dark:text-amber-300">Left on the table</td>
                          <td className={`${rowFigure} font-semibold text-amber-900 dark:text-amber-300`}>{fmt(issue.leftOnTable, issue.unit)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {revealLimit && issue.withinBothLimits === false && (
                    <p className="mt-2 text-sm text-amber-900 dark:text-amber-300">This figure is outside one side&apos;s walk-away limit.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* LLM Feedback */}
        {feedbackLists.length > 0 && (
          <section className="mt-10 grid gap-8 md:grid-cols-3">
            {feedbackLists.map((list) => (
              <div key={list.testId} className="min-w-0 border-t-2 border-px-ink pt-3">
                <h3 className="text-lg font-bold">{list.title}</h3>
                <ul className="mt-3 space-y-3 font-serif leading-relaxed" data-testid={list.testId}>
                  {list.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3" data-testid="feedback-point">
                      <span aria-hidden="true" className="mt-[0.8em] h-px w-3 shrink-0 bg-px-ink-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* Framework Scores */}
        {frameworkScores && Object.keys(frameworkScores).length > 0 && (
          <section className="mt-10 border-t-2 border-px-ink pt-3">
            <h3 className="text-lg font-bold">Framework Scores</h3>
            <div className="mt-3 space-y-3">
              {Object.entries(frameworkScores).map(([key, value]) => {
                const score = Math.round(value);
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1"
                    data-testid="framework-score"
                  >
                    <span className="font-serif" data-testid="framework-score-name">{key}</span>
                    <span className="font-bold tabular-nums" data-testid="framework-score-value">{score}</span>
                    <div aria-hidden="true" className="col-span-2 h-2 bg-px-paper-2">
                      <div className="h-full bg-px-cloth" style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Winning Arguments */}
        {winningArguments.length > 0 && (
          <section className="mt-10 border-t-2 border-px-ink pt-3">
            <h3 className="text-lg font-bold">Key Arguments</h3>
            <div className="mt-3 space-y-5">
              {winningArguments.map((arg, index) => (
                <div key={index} className="border-l-2 border-px-cloth pl-4" data-testid="winning-argument">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 text-xs text-px-ink-2">
                    <span className="font-bold uppercase tracking-[0.06em]">
                      {arg.framework} - {arg.element}
                    </span>
                    <span>Effectiveness: {arg.effectiveness}/5</span>
                  </div>
                  <p className="mt-1 font-serif text-lg italic leading-relaxed">{arg.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Actions */}
        <div className="mt-12 flex flex-col gap-3 sm:flex-row" data-testid="summary-actions">
          <ReattemptButton conversationId={conversation.id} personaId={id} />
          <Link
            href="/dashboard"
            className="flex min-h-12 flex-1 items-center justify-center border-2 border-px-ink px-6 font-bold hover:bg-px-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-ink"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
