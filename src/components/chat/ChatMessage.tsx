'use client';

import { MoodIndicator } from './MoodIndicator';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  personaName?: string;
  mood?: string | null;
}

export function ChatMessage({ role, content, timestamp, personaName, mood }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`} data-testid={isUser ? 'user-message' : 'assistant-message'}>
      {/* Mood avatar for assistant messages */}
      {!isUser && (
        <div className="flex-shrink-0 mr-2 mt-5">
          <MoodIndicator mood={mood} size="sm" />
        </div>
      )}
      <div className={`max-w-[70%]`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {isUser ? 'You' : personaName || 'AI'}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Message Bubble */}
        <div
          className={`
            rounded-lg px-4 py-3 shadow-sm
            ${isUser
              ? 'bg-indigo-600 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
            }
          `}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        </div>
      </div>
    </div>
  );
}
