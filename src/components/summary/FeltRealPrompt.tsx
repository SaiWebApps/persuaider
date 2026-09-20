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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6" data-testid="felt-real">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Did the opponent feel real?</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">1 = not at all, 5 = completely.</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={saving}
            onClick={() => answer(n)}
            data-testid={`felt-real-${n}`}
            aria-pressed={value === n}
            className={`w-10 h-10 rounded-md border text-sm font-medium ${
              value === n
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {value !== null && (
        <p className="mt-2 text-sm text-green-700 dark:text-green-300" data-testid="felt-real-thanks">
          Thanks. Your answer: {value}/5.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
