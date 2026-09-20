import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-indigo-600">Conversation Summary</h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto py-8 px-4">
        {/* Persona + Scenario Info */}
        <FeltRealPrompt conversationId={conversation.id} initial={conversation.summary.feltReal ?? null} />

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {conversation.persona.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {conversation.persona.name}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {conversation.scenario.title}
                {conversation.role && <span data-testid="played-as"> · You played: {conversation.role.name}</span>}
              </p>
            </div>
          </div>
          <p className="text-gray-700 dark:text-gray-300">{conversation.persona.description}</p>

          {conversation.summary.overallScore != null ? (
            <div className="mt-4 text-center">
              <span className="text-4xl font-bold text-indigo-600" data-testid="overall-score">
                {conversation.summary.overallScore}
              </span>
              <span className="text-lg text-gray-500 dark:text-gray-400">/100</span>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Weighted from the framework scores below</p>
            </div>
          ) : null}
          {threshold !== null && conversation.summary.overallScore != null && (
            <p className="mt-2 text-center text-sm" data-testid="win-condition">
              Target score {threshold} (by the evaluator&apos;s score):{' '}
              <span className={conversation.summary.overallScore >= threshold ? 'font-medium text-green-700 dark:text-green-300' : 'font-medium text-amber-700 dark:text-amber-300'}>
                {conversation.summary.overallScore >= threshold ? 'met' : 'not met'}
              </span>
            </p>
          )}
          {conversation.summary.overallScore == null && (
            <div className="mt-4 text-center" data-testid="not-scored">
              <span className="text-2xl font-semibold text-gray-500 dark:text-gray-400">Not scored</span>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The evaluator did not return usable framework scores for this session.</p>
            </div>
          )}
        </div>

        {/* Deal outcome */}
        {deal && deal.issues.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6" data-testid="deal-outcome">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Deal</h3>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${deal.reached ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
                data-testid="deal-status"
              >
                {deal.reached ? 'Deal reached' : 'No deal'}
              </span>
            </div>
            <div className="space-y-4">
              {deal.issues.map((issue) => (
                <div key={issue.name} className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{issue.name}</span>
                    <span className="text-lg font-bold text-indigo-600" data-testid="deal-agreed">
                      {issue.agreed !== null ? fmt(issue.agreed, issue.unit) : 'No agreement'}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <dt className="text-gray-500 dark:text-gray-400">Your target</dt>
                    <dd className="text-right text-gray-900 dark:text-gray-100">{fmt(issue.learnerTarget, issue.unit)}</dd>
                    <dt className="text-gray-500 dark:text-gray-400">Your walk-away</dt>
                    <dd className="text-right text-gray-900 dark:text-gray-100">{fmt(issue.learnerReservation, issue.unit)}</dd>
                    <dt className="text-gray-500 dark:text-gray-400">Their hidden limit</dt>
                    <dd className="text-right text-gray-900 dark:text-gray-100" data-testid="hidden-limit">
                      {revealLimit ? fmt(issue.counterpartReservation, issue.unit) : 'Revealed after your second attempt'}
                    </dd>
                    <dt className="text-gray-500 dark:text-gray-400">Your last ask / their last offer</dt>
                    <dd className="text-right text-gray-900 dark:text-gray-100">
                      {fmt(issue.learnerLastAsk, issue.unit)} / {fmt(issue.counterpartLastOffer, issue.unit)}
                    </dd>
                    {issue.learnerCapture !== null && (
                      <>
                        <dt className="text-gray-500 dark:text-gray-400">Share of your range captured</dt>
                        <dd className="text-right text-gray-900 dark:text-gray-100">{issue.learnerCapture}%</dd>
                      </>
                    )}
                    {revealLimit && issue.leftOnTable !== null && issue.leftOnTable > 0 && (
                      <>
                        <dt className="text-gray-500 dark:text-gray-400">Left on the table</dt>
                        <dd className="text-right text-amber-700 dark:text-amber-300">{fmt(issue.leftOnTable, issue.unit)}</dd>
                      </>
                    )}
                    {revealLimit && issue.withinBothLimits === false && (
                      <dd className="col-span-2 text-amber-700 dark:text-amber-300">This figure is outside one side&apos;s walk-away limit.</dd>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LLM Feedback */}
        {llmFeedback && (
          <div className="space-y-4 mb-6">
            {llmFeedback.whatWentWell.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-bold text-green-700 dark:text-green-400 mb-3">What Went Well</h3>
                <ul className="space-y-2">
                  {llmFeedback.whatWentWell.map((item, i) => (
                    <li key={i} className="text-gray-700 dark:text-gray-300 flex items-start gap-2">
                      <span className="text-green-500 mt-1">+</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {llmFeedback.whatToImprove.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-bold text-amber-700 dark:text-amber-400 mb-3">What To Improve</h3>
                <ul className="space-y-2">
                  {llmFeedback.whatToImprove.map((item, i) => (
                    <li key={i} className="text-gray-700 dark:text-gray-300 flex items-start gap-2">
                      <span className="text-amber-500 mt-1">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {llmFeedback.specificSuggestions.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-3">Suggestions</h3>
                <ul className="space-y-2">
                  {llmFeedback.specificSuggestions.map((item, i) => (
                    <li key={i} className="text-gray-700 dark:text-gray-300 flex items-start gap-2">
                      <span className="text-blue-500 mt-1">*</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Framework Scores */}
        {frameworkScores && Object.keys(frameworkScores).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              Framework Scores
            </h3>
            <div className="space-y-2">
              {Object.entries(frameworkScores).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{key}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Winning Arguments */}
        {winningArguments.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              Key Arguments
            </h3>
            <div className="space-y-4">
              {winningArguments.map((arg, index) => (
                <div
                  key={index}
                  className="border-l-4 border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 p-4 rounded-r-md"
                  data-testid="winning-argument"
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">
                      {arg.framework} - {arg.element}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Effectiveness: {arg.effectiveness}/5
                    </span>
                  </div>
                  <p className="text-gray-800 dark:text-gray-200">{arg.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 flex gap-4">
          <ReattemptButton conversationId={conversation.id} personaId={id} />
          <Link
            href="/dashboard"
            className="flex-1 px-6 py-3 bg-indigo-600 text-white text-center rounded-md hover:bg-indigo-700 font-medium"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
