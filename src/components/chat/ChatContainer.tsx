'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { MoodIndicator } from './MoodIndicator';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/components/theme/ThemeProvider';
import { DEFAULT_MOOD } from '@/types';
import type { WinCondition } from '@/types';
import { winState } from '@/lib/conversation/win';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mood?: string | null;
  createdAt: Date;
}

interface Persona {
  id: string;
  name: string;
  description: string;
  roleType: string;
}

interface ChatContainerProps {
  conversationId: string;
  persona: Persona;
  scenarioTitle: string;
  initialMessages: Message[];
  winCondition?: WinCondition;
  /** The side the learner plays and its confidential brief. */
  learnerRole?: { name: string; brief: string } | null;
}

const PHONE_QUERY = '(max-width: 639px)';

function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** A streaming reply that has not produced its first word yet; the typing dots stand in for it. */
function isEmptyStream(m: Message) {
  return m.id.startsWith('streaming-') && !m.content.trim();
}

export function ChatContainer({ conversationId, persona, scenarioTitle, initialMessages, winCondition, learnerRole }: ChatContainerProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // null until the learner taps: open on a laptop, folded on a phone.
  const [briefOpen, setBriefOpen] = useState<boolean | null>(null);
  const isPhone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
  const briefShown = briefOpen ?? !isPhone;
  const win = winState(messages, winCondition ?? { type: 'manual' });
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  // Current mood from the latest assistant message that carries one
  const currentMood = [...messages].reverse().find((m) => m.role === 'assistant' && m.mood)?.mood || DEFAULT_MOOD;

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  // Keep the newest message in view; scroll only the list so the page itself never moves.
  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isWaitingForResponse]);

  // Size the chat to the visual viewport so the typing box stays above the phone keyboard,
  // including iOS Safari, where 100dvh does not shrink when the keyboard opens.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = shellRef.current;
    if (!vv || !el) return;
    const sync = () => {
      if (vv.scale > 1.01) {
        // Pinch-zoomed: fall back to the CSS height rather than shrinking the layout.
        el.style.height = '';
        el.style.transform = '';
        return;
      }
      const list = scrollRef.current;
      const atBottom = list ? list.scrollHeight - list.scrollTop - list.clientHeight < 40 : false;
      el.style.height = `${vv.height}px`;
      el.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
      if (atBottom) scrollToBottom();
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  // Close the More menu on a click elsewhere or Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const handleSendMessage = async (content: string) => {
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsWaitingForResponse(true);
    setSendError(null);

    try {
      // Try streaming first
      const streamRes = await fetch(`/api/conversations/${conversationId}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (streamRes.status === 429) {
        const data = await streamRes.json().catch(() => ({}));
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        setSendError(data.error || 'Daily AI budget reached.');
        return;
      }

      if (streamRes.ok && streamRes.body) {
        // Add a streaming assistant message placeholder
        const streamingMsgId = `streaming-${Date.now()}`;
        let streamedContent = '';

        setMessages((prev) => [
          ...prev,
          { id: streamingMsgId, role: 'assistant', content: '', mood: null, createdAt: new Date() },
        ]);
        // The empty placeholder shows as typing dots until its first word arrives.
        setIsWaitingForResponse(false);

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'chunk') {
                streamedContent += event.text;
                setMessages((prev) =>
                  prev.map((m) => m.id === streamingMsgId ? { ...m, content: streamedContent } : m)
                );
              } else if (event.type === 'done') {
                setMessages((prev) => [
                  ...prev.filter((m) => m.id !== tempUserMsg.id && m.id !== streamingMsgId),
                  { id: event.userMessageId, role: 'user', content, createdAt: new Date() },
                  { id: event.messageId, role: 'assistant', content: event.content, mood: event.mood, createdAt: new Date() },
                ]);
              } else if (event.type === 'error') {
                throw new Error(event.message);
              }
            } catch (parseErr) {
              if (parseErr instanceof SyntaxError) continue;
              throw parseErr;
            }
          }
        }
        return;
      }

      // Fallback: non-streaming
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        {
          id: data.userMessage.id,
          role: 'user',
          content: data.userMessage.content,
          createdAt: new Date(data.userMessage.createdAt),
        },
        {
          id: data.assistantMessage.id,
          role: 'assistant',
          content: data.assistantMessage.content,
          mood: data.assistantMessage.mood,
          createdAt: new Date(data.assistantMessage.createdAt),
        },
      ]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id && !m.id.startsWith('streaming-')));
      setSendError('Failed to send message. Please try again.');
    } finally {
      setIsWaitingForResponse(false);
    }
  };

  const handleEndNegotiation = async () => {
    setEnding(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/summary`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to end negotiation');

      router.push(`/persona/${persona.id}/summary`);
    } catch (error) {
      console.error('Error ending negotiation:', error);
      alert('Failed to end negotiation');
    } finally {
      setEnding(false);
      setShowEndModal(false);
    }
  };

  const handleAbortConversation = async () => {
    setAborting(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to abort conversation');

      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      console.error('Error aborting conversation:', error);
      alert('Failed to abort conversation');
    } finally {
      setAborting(false);
      setShowAbortModal(false);
    }
  };

  const handlePrintConversation = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const messagesHTML = messages.map((msg) => {
      const sender = msg.role === 'user' ? 'You' : persona.name;
      const moodLabel = msg.role === 'assistant' && msg.mood
        ? ` [${msg.mood}]`
        : '';
      const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const bgColor = msg.role === 'user' ? '#eef2ff' : '#ffffff';
      const borderColor = msg.role === 'user' ? '#6366f1' : '#e5e7eb';
      return `
        <div style="margin-bottom: 16px; padding: 12px 16px; background: ${bgColor}; border-left: 3px solid ${borderColor}; border-radius: 4px;">
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
            <strong>${sender}</strong>${moodLabel} &middot; ${time}
          </div>
          <div style="font-size: 14px; color: #1f2937; white-space: pre-wrap;">${msg.content}</div>
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${scenarioTitle} - ${persona.name}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            color: #1f2937;
          }
          @media print {
            body { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <h1 style="color: #4f46e5; margin-bottom: 4px;">${scenarioTitle}</h1>
        <p style="color: #6b7280; margin-top: 0;">Conversation with <strong>${persona.name}</strong> (${persona.roleType})</p>
        <p style="color: #9ca3af; font-size: 12px;">Exported ${new Date().toLocaleString()} &middot; ${messages.length} messages</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        ${messagesHTML}
        <div style="margin-top: 30px; text-align: center; color: #9ca3af; font-size: 12px;">
          Generated by Persuaider
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const typing = isWaitingForResponse || messages.some(isEmptyStream);
  const menuItem =
    'flex w-full items-center justify-between gap-4 min-h-11 px-4 text-left text-sm font-bold hover:bg-px-paper-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-px-cloth';

  return (
    <div
      ref={shellRef}
      className="fixed inset-x-0 top-0 h-dvh flex flex-col overflow-hidden bg-px-paper text-px-ink"
    >
      {/* Header: who you are talking to, their mood, the main action, and everything else under More */}
      <header className="shrink-0 bg-px-field text-px-on px-3 py-2.5 sm:px-6 sm:py-4" data-testid="chat-header">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="hidden sm:block text-xs font-bold uppercase tracking-[0.06em] text-px-on-2 truncate">{scenarioTitle}</p>
            <h1
              className="text-2xl sm:text-4xl font-bold leading-none tracking-[-0.02em] [font-stretch:72%] truncate"
              data-testid="counterpart-name"
            >
              {persona.name}
            </h1>
            <div className="mt-1 text-px-on-2">
              <MoodIndicator mood={currentMood} showLabel />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              className="min-h-11 px-3 sm:px-5 bg-px-cloth text-px-on-cloth text-sm font-bold hover:bg-px-cloth-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-on"
            >
              End Negotiation
            </button>
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={moreOpen}
                className="min-h-11 px-3 sm:px-4 border-2 border-px-on-2 text-sm font-bold hover:border-px-on transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-on"
              >
                More
              </button>
              {moreOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-40 w-56 border-2 border-px-ink bg-px-paper text-px-ink py-1"
                  data-testid="more-menu"
                >
                  <button type="button" className={menuItem} onClick={() => { setMoreOpen(false); router.push('/dashboard'); }}>
                    Back to Dashboard
                  </button>
                  <button type="button" className={menuItem} onClick={() => { setMoreOpen(false); handlePrintConversation(); }}>
                    Print / Export
                  </button>
                  <button
                    type="button"
                    className={`${menuItem} text-red-800 dark:text-red-400`}
                    onClick={() => { setMoreOpen(false); setShowAbortModal(true); }}
                  >
                    Abort
                  </button>
                  <div className="my-1 border-t border-px-ink/30" />
                  <button type="button" className={menuItem} onClick={() => { setMoreOpen(false); cycleTheme(); }} title={`Theme: ${theme}`}>
                    <span>Theme</span>
                    <span className="font-normal text-px-ink-2 capitalize" aria-hidden="true">{theme}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Your side and confidential brief: one tap away, folded by default on a phone.
          Capped at a share of the chat (which follows the visual viewport), so it never pushes the typing box out. */}
      {learnerRole && (
        <div
          className="shrink-0 max-h-[30%] overflow-y-auto overscroll-contain bg-px-paper-2 border-b border-px-ink/30 px-3 py-1.5 sm:px-6"
          data-testid="your-brief"
        >
          <button
            type="button"
            onClick={() => setBriefOpen(!briefShown)}
            className="min-h-9 text-left text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-cloth"
            aria-expanded={briefShown}
          >
            You play: {learnerRole.name} · your confidential brief {briefShown ? '▾' : '▸'}
          </button>
          {briefShown && (
            <p className="pb-1 font-serif text-base leading-relaxed text-px-ink-2 max-w-[70ch] whitespace-pre-wrap break-words" data-testid="your-brief-text">
              {learnerRole.brief}
            </p>
          )}
        </div>
      )}

      {/* Messages: the only part of the page that scrolls */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          {messages.filter((m) => !isEmptyStream(m)).map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              timestamp={message.createdAt}
              personaName={persona.name}
            />
          ))}

          {typing && (
            <div className="flex justify-start mb-5" data-testid="typing-indicator">
              <div className="flex flex-col items-start">
                <span className="mb-1 text-xs font-bold uppercase tracking-[0.04em]">{persona.name}</span>
                <div className="bg-px-paper-2 px-4 py-3.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-px-ink-2 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-px-ink-2 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-px-ink-2 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Limits and errors sit just above the typing box */}
      {win.limitReached && (
        <div
          role="status"
          data-testid="limit-banner"
          className="shrink-0 bg-px-field text-px-on px-3 py-2.5 sm:px-6 text-sm font-medium"
        >
          You have used all {win.maxMessages} messages for this scenario. End the negotiation to get your summary.
        </div>
      )}
      {!win.limitReached && win.remaining !== null && win.remaining <= 2 && (
        <p className="shrink-0 px-3 pb-1 sm:px-6 text-sm font-bold tabular-nums" data-testid="limit-remaining">
          {win.remaining} {win.remaining === 1 ? 'message' : 'messages'} left.
        </p>
      )}
      {sendError && (
        <div
          role="alert"
          data-testid="chat-error"
          className="shrink-0 border-y border-red-700 bg-px-paper-2 px-3 py-2 sm:px-6 text-sm"
        >
          {sendError}
        </div>
      )}
      <ChatInput onSendMessage={handleSendMessage} disabled={isWaitingForResponse || win.limitReached} />

      {/* End Negotiation Modal */}
      <Modal
        isOpen={showEndModal}
        onClose={() => setShowEndModal(false)}
        title="End Negotiation"
      >
        <div>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            End this negotiation with <strong>{persona.name}</strong>?
            Your conversation will be evaluated and you&apos;ll receive a summary with feedback.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowEndModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleEndNegotiation} disabled={ending} data-testid="confirm-end-negotiation">
              {ending ? 'Generating Summary...' : 'End Negotiation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Abort Confirmation Modal */}
      <Modal
        isOpen={showAbortModal}
        onClose={() => setShowAbortModal(false)}
        title="Abort Conversation"
      >
        <div>
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Are you sure you want to abort this conversation with <strong>{persona.name}</strong>?
            All progress will be lost and the conversation will be deleted.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAbortModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleAbortConversation} disabled={aborting}>
              {aborting ? 'Aborting...' : 'Abort Conversation'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
