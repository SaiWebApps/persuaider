'use client';

import { useState } from 'react';

/**
 * One question after a session: did the opponent feel real? This is the
 * measurement behind the "ten strangers" gate; stored on the Summary.
 */
export function FeltRealPrompt({ conversationId, initial }: { conversationId: string; initial: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (n: number) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/summary`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feltReal: n }),
      });
      if (!res.ok) {
        setError('Could not save your answer');
        return;
      }
      setValue(n);
    } catch {
      setError('Could not save your answer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="flex flex-col gap-3 border-2 border-t-0 border-px-ink px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-8"
      data-testid="felt-real"
    >
      <div>
        <h3 className="text-lg font-bold">Did the opponent feel real?</h3>
        <p className="font-serif text-sm text-px-ink-2">1 = not at all, 5 = completely.</p>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={saving}
            onClick={() => answer(n)}
            data-testid={`felt-real-${n}`}
            aria-pressed={value === n}
            className={`h-11 w-12 border-2 text-sm font-bold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-ink disabled:opacity-60 ${
              value === n
                ? 'bg-px-cloth text-px-on-cloth border-px-cloth'
                : 'bg-px-paper text-px-ink border-px-ink hover:bg-px-paper-2'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {value !== null && (
        <p className="w-full font-serif text-sm" data-testid="felt-real-thanks">
          Thanks. Your answer: {value}/5.
        </p>
      )}
      {error && <p className="w-full text-sm text-red-700 dark:text-red-400">{error}</p>}
    </section>
  );
}
