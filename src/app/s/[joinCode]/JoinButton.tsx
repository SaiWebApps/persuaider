'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** How long the "Joining…" label stays up before joining starts, so it can be read. */
const JOIN_LABEL_MS = 1500;

/**
 * Joins the scenario through the join route and then loads the dashboard with a
 * full navigation. With `autoJoin` (a visitor arriving back from sign-up) it
 * shows a plain "Joining…" label, joins on mount and needs no click; if the
 * join reports the visitor is not signed in, it shows `signedOut` instead. A
 * hard navigation rather than the app router is deliberate: the client router
 * drops a server-side redirect issued during Clerk's post-sign-up navigation,
 * leaving the page stuck rendering.
 */
export function JoinButton({
  joinCode,
  needsAccessCode,
  autoJoin = false,
  signedOut,
}: {
  joinCode: string;
  needsAccessCode: boolean;
  autoJoin?: boolean;
  signedOut?: ReactNode;
}) {
  const willAutoJoin = autoJoin && !needsAccessCode;
  const [accessCode, setAccessCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [autoJoining, setAutoJoining] = useState(willAutoJoin);
  const [isSignedOut, setIsSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (res.status === 401 && signedOut) {
        setIsSignedOut(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not join');
      }
    } catch {
      setError('Could not join');
    }
    setBusy(false);
    setAutoJoining(false);
  };

  useEffect(() => {
    if (!willAutoJoin) return;
    const timer = window.setTimeout(() => void join(''), JOIN_LABEL_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [willAutoJoin]);

  if (isSignedOut) return <>{signedOut}</>;

  if (autoJoining) {
    return (
      <p className="min-h-12 flex items-center text-xl font-bold" role="status" data-testid="share-joining">
        Joining…
      </p>
    );
  }

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
        className="inline-flex items-center justify-center min-h-12 px-7 py-3.5 bg-px-cloth text-px-on-cloth font-bold hover:bg-px-cloth-hover disabled:opacity-60"
      >
        {busy ? 'Joining…' : 'Practise this scenario'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400" data-testid="share-join-error">{error}</p>}
    </div>
  );
}
