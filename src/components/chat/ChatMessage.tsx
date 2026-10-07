'use client';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  personaName?: string;
}

export function ChatMessage({ role, content, timestamp, personaName }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-5`} data-testid={isUser ? 'user-message' : 'assistant-message'}>
      <div className={`min-w-0 max-w-[88%] sm:max-w-[72%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-bold uppercase tracking-[0.04em] text-px-ink" data-testid="message-sender">
            {isUser ? 'You' : personaName || 'AI'}
          </span>
          <span className="text-xs tabular-nums text-px-ink-2">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div
          className={
            isUser
              ? 'bg-px-cloth text-px-on-cloth px-4 py-3'
              : 'bg-px-paper-2 text-px-ink px-4 py-3'
          }
        >
          <p className="font-serif text-base leading-relaxed whitespace-pre-wrap break-words">{content}</p>
        </div>
      </div>
    </div>
  );
}
