'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Joins the scenario through the join route and then loads the dashboard with a
 * full navigation. With `autoJoin` (a visitor arriving back from sign-up) it
 * joins on mount and needs no click. A hard navigation rather than the app
 * router is deliberate: the client router drops a server-side redirect issued
 * during Clerk's post-sign-up navigation, leaving the page stuck rendering.
 */
export function JoinButton({ joinCode, needsAccessCode, autoJoin = false }: { joinCode: string; needsAccessCode: boolean; autoJoin?: boolean }) {
  const willAutoJoin = autoJoin && !needsAccessCode;
  const [accessCode, setAccessCode] = useState('');
  const [busy, setBusy] = useState(willAutoJoin);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const join = async (code: string) => {
    try {
      const res = await fetch('/api/scenarios/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode, accessCode: code || undefined }),
      });
      if (res.ok || res.status === 409) {
        window.location.assign('/dashboard?notice=joined');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not join');
    } catch {
      setError('Could not join');
    }
    setBusy(false);
  };

  useEffect(() => {
    if (!willAutoJoin || started.current) return;
    started.current = true;
    void join('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [willAutoJoin]);

  return (
    <div className="space-y-3">
      {needsAccessCode && (
        <input
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          placeholder="Access code"
          data-testid="share-access-code"
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        />
      )}
      <button
        type="button"
        onClick={() => {
          setBusy(true);
          setError(null);
          void join(accessCode);
        }}
        disabled={busy}
        data-testid="share-join"
        className="px-5 py-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? 'Joining…' : 'Practise this scenario'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400" data-testid="share-join-error">{error}</p>}
    </div>
  );
}
