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
        className="min-h-12 w-full px-6 bg-px-cloth text-px-on-cloth text-center font-bold hover:bg-px-cloth-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-ink disabled:opacity-60"
      >
        {busy ? 'Starting…' : 'Try again'}
      </button>
      {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
