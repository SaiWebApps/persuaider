import type { RunSide } from '@/lib/run/transcript';

interface RunMessageProps {
  side: RunSide;
  label: string;
  content: string;
}

/** One turn of a run: the speaking side's label, then what it said. Used on the run page and its report. */
export function RunMessage({ side, label, content }: RunMessageProps) {
  return (
    <div
      data-testid="run-message"
      className={`rounded-xl bg-white dark:bg-gray-800 px-4 py-3 text-[14.5px] leading-relaxed border ${
        side === 'learner'
          ? 'border-indigo-200 dark:border-indigo-800 border-l-[3px] border-l-indigo-600'
          : 'border-slate-300 dark:border-gray-600'
      }`}
    >
      <div className={`font-mono text-[11px] mb-1.5 ${side === 'learner' ? 'text-indigo-500 dark:text-indigo-300' : 'text-slate-400'}`}>
        {label}
      </div>
      <p className="whitespace-pre-wrap">{content}</p>
    </div>
  );
}
