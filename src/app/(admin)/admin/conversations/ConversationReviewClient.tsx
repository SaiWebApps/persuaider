'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ConversationListItem {
  id: string;
  userId: string;
  username: string;
  personaName: string;
  scenarioTitle: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  messageCount: number;
  score: number | null;
}

interface ConversationsResponse {
  conversations: ConversationListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export function ConversationReviewClient() {
  const [data, setData] = useState<ConversationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/admin/conversations?page=${page}&limit=20`);
        if (!res.ok) throw new Error('Failed to fetch conversations');
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [page]);

  if (loading) {
    return (
      <div data-testid="conversations-loading" className="flex justify-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Loading conversations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="conversations-error" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div data-testid="conversations-list" className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Conversation Review</h2>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400">User</th>
              <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400">Persona</th>
              <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400">Scenario</th>
              <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400">Status</th>
              <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400">Date</th>
              <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400">Messages</th>
              <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400">Score</th>
              <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.conversations.map((conv) => (
              <tr key={conv.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{conv.username}</td>
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{conv.personaName}</td>
                <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{conv.scenarioTitle}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    conv.status === 'completed'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                      : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                  }`}>
                    {conv.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                  {new Date(conv.startedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">{conv.messageCount}</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                  {conv.score !== null ? conv.score : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/conversations/${conv.id}`}
                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-sm font-medium"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div data-testid="pagination" className="flex justify-between items-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {data.page} of {data.totalPages} ({data.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 text-gray-700 dark:text-gray-300"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 text-gray-700 dark:text-gray-300"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
