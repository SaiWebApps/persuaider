'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { OUTCOME_LABELS, nextSide, type RunSide, type RunStatus, type RunTurn } from '@/lib/run/transcript';
import { RunOutcome } from './RunOutcome';

interface RunViewerProps {
  runId: string;
  scenarioTitle: string;
  personaName: string;
  learnerSide: string;
  counterpartSide: string;
  maxMessages: number;
  initialState: { status: RunStatus; turns: RunTurn[] };
}

const AUTO_RETRIES = 2;

function initials(text: string): string {
  return text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

/**
 * Two desks: the counterpart on the left, the You-play side on the right, and
 * each turn crossing the gap. Turns are fetched one at a time as soon as the
 * page is open; the run ends with one unmistakable outcome at the bottom.
 */
export function RunViewer({ runId, scenarioTitle, personaName, learnerSide, counterpartSide, maxMessages, initialState }: RunViewerProps) {
  const [turns, setTurns] = useState(initialState.turns);
  const [status, setStatus] = useState(initialState.status);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lastTurnRef = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);

  const running = status === 'running';
  const learnerTurns = turns.filter((t) => t.side === 'learner').length;
  const speaking: RunSide = nextSide(turns);

  useEffect(() => {
    if (!running || error) return;
    let cancelled = false;
    (async () => {
      let message = 'The next turn could not be generated right now.';
      let retry = attempt < AUTO_RETRIES;
      try {
        const res = await fetch(`/api/runs/${runId}/turn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seenTurns: turns.length }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setAttempt(0);
          setTurns(data.turns);
          setStatus(data.status);
          return;
        }
        message = data.error || message;
        if (res.status === 429 || res.status === 404) retry = false;
      } catch {
        if (cancelled) return;
      }
      if (retry) setTimeout(() => !cancelled && setAttempt((a) => a + 1), 2000);
      else setError(message);
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, running, error, attempt, turns.length]);

  // Follow the newest turn while running; once it ends, bring the outcome into view.
  useEffect(() => {
    if (running) lastTurnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    else outcomeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [turns.length, running]);

  const sideLabel = (side: RunSide) => (side === 'learner' ? `${learnerSide} (You play)` : counterpartSide);
  const progress = Math.min(100, (learnerTurns / maxMessages) * 100);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-950 text-slate-900 dark:text-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-7 py-8 flex flex-col gap-4">
        <Link href="/dashboard" className="text-sm text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100 w-fit">
          ← Dashboard
        </Link>

        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{scenarioTitle}</h1>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">Simulation · both sides played by AI · you&apos;re watching</p>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className="inline-flex items-center text-xs font-semibold text-white bg-indigo-600 px-2.5 py-1 rounded-md" data-testid="you-play">
                You play: {learnerSide}
              </span>
              <span className="text-sm text-slate-600 dark:text-gray-300" data-testid="against-side">
                Against: {counterpartSide} · {personaName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs text-slate-600 dark:text-gray-300">
            <span>
              YOUR SIDE {String(learnerTurns).padStart(2, '0')} / {maxMessages}
            </span>
            <span className="w-36 h-1 rounded bg-slate-300 dark:bg-gray-700 overflow-hidden" aria-hidden="true">
              <span className="block h-full bg-slate-900 dark:bg-gray-100 transition-all" style={{ width: `${progress}%` }} />
            </span>
          </div>
        </header>

        <div className="rounded-2xl border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          {/* Desk name plates */}
          <div className="grid grid-cols-[1fr_40px_1fr] md:grid-cols-[1fr_64px_1fr] border-b border-slate-200 dark:border-gray-700">
            <div className="flex items-center gap-3 px-4 md:px-6 py-4 bg-slate-50 dark:bg-gray-900">
              <span className="hidden sm:grid w-10 h-10 rounded-lg place-items-center bg-slate-200 dark:bg-gray-700 text-sm font-semibold" aria-hidden="true">
                {initials(personaName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{counterpartSide}</p>
                <p className="text-xs text-slate-500 dark:text-gray-400 truncate">{personaName}</p>
              </div>
              {running && speaking === 'counterpart' && !error && <SpeakingDot />}
            </div>
            <div className="grid place-items-center border-x border-slate-200 dark:border-gray-700 font-mono text-[10.5px] tracking-widest text-slate-400">VS</div>
            <div className="flex flex-row-reverse items-center gap-3 px-4 md:px-6 py-4 bg-indigo-50 dark:bg-indigo-950/40 text-right">
              <span className="hidden sm:grid w-10 h-10 rounded-lg place-items-center bg-indigo-600 text-white text-sm font-semibold" aria-hidden="true">
                {initials(learnerSide)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-indigo-800 dark:text-indigo-200 flex flex-wrap items-center justify-end gap-2">
                  <span className="text-[10.5px] uppercase tracking-wider bg-indigo-600 text-white px-1.5 py-1 rounded">You play</span>
                  <span>{learnerSide}</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-gray-400">Played by AI for you</p>
              </div>
              {running && speaking === 'learner' && !error && <SpeakingDot />}
            </div>
          </div>

          {/* Turns cross the gap: counterpart left, You-play side right */}
          <div aria-live="polite">
            {turns.map((turn, i) => (
              <TurnRow key={i} index={i} side={turn.side} rowRef={i === turns.length - 1 ? lastTurnRef : undefined}>
                <div
                  data-testid="run-message"
                  className={`rounded-xl bg-white dark:bg-gray-800 px-4 py-3 text-[14.5px] leading-relaxed border ${
                    turn.side === 'learner'
                      ? 'border-indigo-200 dark:border-indigo-800 border-l-[3px] border-l-indigo-600'
                      : 'border-slate-300 dark:border-gray-600'
                  }`}
                >
                  <div className={`font-mono text-[11px] mb-1.5 ${turn.side === 'learner' ? 'text-indigo-500 dark:text-indigo-300' : 'text-slate-400'}`}>
                    {sideLabel(turn.side)}
                  </div>
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                </div>
              </TurnRow>
            ))}
            {running && !error && (
              <TurnRow index={turns.length} side={speaking} pending>
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-gray-600 px-4 py-3 text-sm text-slate-500 dark:text-gray-400 flex items-center gap-2">
                  <span className="inline-flex gap-1" aria-hidden="true">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:300ms]" />
                  </span>
                  {speaking === 'learner' ? `${learnerSide} (You play)` : counterpartSide} is writing turn {turns.length + 1}…
                </div>
              </TurnRow>
            )}
          </div>

          {error && (
            <div className="border-t border-slate-200 dark:border-gray-700 px-6 py-4 flex flex-wrap items-center justify-between gap-3 bg-red-50 dark:bg-red-950/40">
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                type="button"
                onClick={() => { setAttempt(0); setError(null); }}
                className="text-sm font-medium px-3 py-1.5 rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-gray-900 hover:bg-red-100 dark:hover:bg-red-900/40"
              >
                Try again
              </button>
            </div>
          )}

          {!running && <RunOutcome ref={outcomeRef} status={status} label={OUTCOME_LABELS[status as Exclude<RunStatus, 'running'>]} />}
        </div>

        <p className="text-xs text-slate-500 dark:text-gray-400">Turns alternate across the gap; your side is always on the right.</p>
      </div>
    </div>
  );
}

function SpeakingDot() {
  return (
    <span className="hidden md:flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-gray-400 whitespace-nowrap">
      <i className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
      speaking next
    </span>
  );
}

interface TurnRowProps {
  index: number;
  side: RunSide;
  pending?: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}

function TurnRow({ index, side, pending, rowRef, children }: TurnRowProps) {
  const cell = 'px-3 md:px-6 py-3';
  return (
    <div ref={rowRef} className="grid grid-cols-[1fr_40px_1fr] md:grid-cols-[1fr_64px_1fr]">
      <div className={`${cell} bg-slate-50 dark:bg-gray-900`}>{side === 'counterpart' && children}</div>
      <div className="relative border-x border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-slate-300 dark:border-gray-700" aria-hidden="true" />
        {!pending && (
          <span
            className={`relative mx-auto mt-5 grid w-6 h-6 place-items-center rounded-full border bg-white dark:bg-gray-900 font-mono text-[10.5px] font-semibold ${
              side === 'learner' ? 'border-indigo-200 text-indigo-700 dark:text-indigo-300' : 'border-slate-300 text-slate-500'
            }`}
            aria-hidden="true"
          >
            {index + 1}
          </span>
        )}
      </div>
      <div className={`${cell} bg-indigo-50 dark:bg-indigo-950/40`}>{side === 'learner' && children}</div>
    </div>
  );
}
