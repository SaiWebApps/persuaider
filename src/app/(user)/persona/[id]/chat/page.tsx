import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { startOrResumeConversation } from '@/lib/conversation/start';
import { AuthorizationError, NotFoundError } from '@/types';
import { readWinCondition } from '@/lib/codec/scenario';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  let conversation;
  try {
    ({ conversation } = await startOrResumeConversation({
      userId: session.user.id,
      role: session.user.role,
      personaId: id,
    }));
  } catch (error) {
    if (error instanceof AuthorizationError) redirect('/dashboard?notice=join-required');
    if (error instanceof NotFoundError) redirect('/dashboard?notice=persona-missing');
    throw error;
  }

  return (
    <ChatContainer
      conversationId={conversation.id}
      persona={conversation.persona}
      scenarioTitle={conversation.scenario.title}
      winCondition={readWinCondition(conversation.scenario.winCondition)}
      initialMessages={conversation.messages.map((m) => ({
        ...m,
        role: m.role as 'user' | 'assistant',
      }))}
    />
  );
}
