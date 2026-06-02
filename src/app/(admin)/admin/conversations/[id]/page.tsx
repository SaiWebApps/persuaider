'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Message {
  role: string;
  content: string;
  mood: string | null;
  createdAt: string;
}

interface ConversationDetail {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  user: { username: string; email: string };
  persona: { name: string; roleType: string };
  scenario: { title: string };
  messages: Message[];
  summary: {
    overallScore: number | null;
    winningArguments: string;
    llmFeedback: string | null;
    frameworkScores: string | null;
  } | null;
}

export default function ConversationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/conversations/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch conversation');
        return res.json();
      })
      .then((data) => setConversation(data.conversation))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div data-testid="conversation-detail-loading" className="flex justify-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Loading conversation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="conversation-detail-error" className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (!conversation) return null;

  return (
    <div data-testid="conversation-detail" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Conversation Detail</h2>
        <Link
          href="/admin/conversations"
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
        >
          Back to list
        </Link>
      </div>

      <div data-testid="conversation-header" className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400">User</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">{conversation.user.username}</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs">{conversation.user.email}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Persona</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">{conversation.persona.name}</p>
            <p className="text-gray-500 dark:text-gray-400 text-xs">{conversation.persona.roleType}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Scenario</p>
            <p className="font-medium text-gray-900 dark:text-gray-100">{conversation.scenario.title}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Status</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              conversation.status === 'completed'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
            }`}>
              {conversation.status}
            </span>
          </div>
        </div>
      </div>

      <div data-testid="conversation-messages" className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Messages ({conversation.messages.length})
        </h3>
        {conversation.messages.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No messages in this conversation.</p>
        ) : (
          conversation.messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 ml-8'
                  : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mr-8'
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  {msg.role}
                  {msg.mood && ` (${msg.mood})`}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(msg.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))
        )}
      </div>

      {conversation.summary && (
        <div data-testid="conversation-summary" className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Summary</h3>
          <div className="space-y-3 text-sm">
            {conversation.summary.overallScore !== null && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Overall Score: </span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{conversation.summary.overallScore}/100</span>
              </div>
            )}
            {conversation.summary.winningArguments && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Winning Arguments: </span>
                <span className="text-gray-900 dark:text-gray-100">{conversation.summary.winningArguments}</span>
              </div>
            )}
            {conversation.summary.llmFeedback && (
              <div>
                <span className="text-gray-500 dark:text-gray-400">Feedback: </span>
                <span className="text-gray-900 dark:text-gray-100">{conversation.summary.llmFeedback}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
