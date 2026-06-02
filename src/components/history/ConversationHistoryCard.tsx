'use client';

import Link from 'next/link';

interface ConversationHistoryCardProps {
  conversation: {
    id: string;
    personaId: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    persona: {
      name: string;
    };
    scenario: {
      title: string;
    };
    summary: {
      overallScore: number | null;
    } | null;
  };
}

export function ConversationHistoryCard({ conversation }: ConversationHistoryCardProps) {
  const isCompleted = conversation.status === 'completed';
  const href = isCompleted
    ? `/persona/${conversation.personaId}/summary`
    : `/persona/${conversation.personaId}/chat`;

  return (
    <Link
      href={href}
      className="block bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
      data-testid="conversation-history-card"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate"
            data-testid="persona-name"
          >
            {conversation.persona.name}
          </h3>
          <p
            className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate"
            data-testid="scenario-title"
          >
            {conversation.scenario.title}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          {isCompleted && conversation.summary?.overallScore != null && (
            <span
              className="text-sm font-bold text-indigo-600 dark:text-indigo-400"
              data-testid="score"
            >
              {conversation.summary.overallScore}/100
            </span>
          )}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              isCompleted
                ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
            }`}
            data-testid="status-badge"
          >
            {isCompleted ? 'Completed' : 'In Progress'}
          </span>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        Started {new Date(conversation.startedAt).toLocaleDateString()}
        {conversation.completedAt && (
          <span> &middot; Completed {new Date(conversation.completedAt).toLocaleDateString()}</span>
        )}
      </div>
    </Link>
  );
}
