'use client';

import { useState, FormEvent } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, disabled = false }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!message.trim() || sending || disabled) return;

    setSending(true);
    try {
      await onSendMessage(message.trim());
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="shrink-0 border-t-4 border-px-ink bg-px-paper px-3 py-3 sm:px-6 sm:py-4">
      <div className="flex gap-2 items-stretch">
        <textarea
          data-testid="chat-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message…"
          rows={2}
          disabled={disabled || sending}
          className="flex-1 min-w-0 px-3 py-2 border-2 border-px-ink bg-px-paper text-px-ink placeholder:text-px-ink-2 font-serif text-base leading-snug resize-none focus:outline-none focus:border-px-cloth disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!message.trim() || sending || disabled}
          className="shrink-0 min-h-11 px-5 bg-px-cloth text-px-on-cloth font-bold hover:bg-px-cloth-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-cloth disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="send-button"
        >
          {sending ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Sending...
            </span>
          ) : (
            'Send'
          )}
        </button>
      </div>
      <p className="hidden sm:block text-xs text-px-ink-2 mt-2">
        Tip: Press Enter to send, Shift+Enter for new line
      </p>
    </form>
  );
}
