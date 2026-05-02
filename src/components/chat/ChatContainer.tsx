'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { MoodIndicator } from './MoodIndicator';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { DEFAULT_MOOD } from '@/types';

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
}

export function ChatContainer({ conversationId, persona, scenarioTitle, initialMessages }: ChatContainerProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [ending, setEnding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Derive current mood from the latest assistant message
  const currentMood = (() => {
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const latest = assistantMessages[assistantMessages.length - 1];
    return latest?.mood || DEFAULT_MOOD;
  })();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsWaitingForResponse(true);

    try {
      // Try streaming first
      const streamRes = await fetch(`/api/conversations/${conversationId}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (streamRes.ok && streamRes.body) {
        // Add a streaming assistant message placeholder
        const streamingMsgId = `streaming-${Date.now()}`;
        let streamedContent = '';

        setMessages((prev) => [
          ...prev,
          { id: streamingMsgId, role: 'assistant', content: '', mood: DEFAULT_MOOD, createdAt: new Date() },
        ]);
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
      alert('Failed to send message. Please try again.');
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <MoodIndicator mood={currentMood} size="md" showLabel />
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{persona.name}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {scenarioTitle} &middot; {persona.description.substring(0, 80)}...
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <ThemeToggle />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push('/dashboard')}
            >
              Back to Dashboard
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrintConversation}
            >
              Print / Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowEndModal(true)}
            >
              End Negotiation
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowAbortModal(true)}
            >
              Abort
            </Button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 px-6 py-4">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
            timestamp={message.createdAt}
            personaName={persona.name}
            mood={message.mood}
          />
        ))}

        {/* Typing indicator */}
        {isWaitingForResponse && (
          <div className="flex justify-start mb-4">
            <div className="max-w-[70%]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">{persona.name}</span>
              </div>
              <div className="rounded-lg px-4 py-3 shadow-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <ChatInput onSendMessage={handleSendMessage} disabled={isWaitingForResponse} />

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
