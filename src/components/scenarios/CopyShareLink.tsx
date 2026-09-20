'use client';

import { useState } from 'react';

/**
 * Copies the scenario's share link. The origin is read at click time, never during
 * render, so server and client markup match. If the clipboard is unavailable the
 * link is shown so it can be copied by hand.
 */
export function CopyShareLink({ joinCode, testId, className }: { joinCode: string; testId?: string; className?: string }) {
  const [state, setState] = useState<{ copied: boolean; url: string } | null>(null);

  const copy = async () => {
    const url = `${window.location.origin}/s/${encodeURIComponent(joinCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      setState({ copied: true, url });
    } catch {
      setState({ copied: false, url });
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={copy} data-testid={testId} className={className ?? 'text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline'}>
        Share
      </button>
      {state && (
        <span className="text-xs text-gray-600 dark:text-gray-400" data-testid={testId ? `${testId}-status` : undefined}>
          {state.copied ? 'Link copied: ' : 'Copy this link: '}
          <code>{state.url}</code>
        </span>
      )}
    </span>
  );
}
