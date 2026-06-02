'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ConversationHistoryCard } from '@/components/history/ConversationHistoryCard';

interface Conversation {
  id: string;
  personaId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  persona: { name: string };
  scenario: { title: string };
  summary: { overallScore: number | null } | null;
}

interface HistoryClientProps {
  conversations: Conversation[];
}

const PAGE_SIZE = 20;

export function HistoryClient({ conversations }: HistoryClientProps) {
  const [page, setPage] = useState(1);

  const totalPages = Math.ceil(conversations.length / PAGE_SIZE);
  const paginated = conversations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-indigo-600">Conversation History</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Profile
            </Link>
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
        {conversations.length === 0 ? (
          <div className="text-center py-12" data-testid="empty-state">
            <p className="text-gray-500 dark:text-gray-400">
              No conversations yet. Start practicing from your dashboard!
            </p>
            <Link
              href="/dashboard"
              className="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3" data-testid="conversation-list">
              {paginated.map((conv) => (
                <ConversationHistoryCard key={conv.id} conversation={conv} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6" data-testid="pagination">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
