'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Starts a fresh attempt with the same persona (POST /api/conversations/[id]/reattempt). */
export function ReattemptButton({ conversationId, personaId }: { conversationId: string; personaId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reattempt = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/reattempt`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not start a new attempt');
        return;
      }
      router.push(`/persona/${personaId}/chat`);
    } catch {
      setError('Could not start a new attempt');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1">
      <button
        type="button"
        onClick={reattempt}
        disabled={busy}
        data-testid="reattempt"
        className="w-full px-6 py-3 border border-indigo-600 text-indigo-700 dark:text-indigo-300 text-center rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-medium disabled:opacity-60"
      >
        {busy ? 'Starting…' : 'Try again'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
