import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/client';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { startOrResumeConversation } from '@/lib/conversation/start';
import { AuthorizationError, NotFoundError } from '@/types';
import { readWinCondition } from '@/lib/codec/scenario';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

/** The tab reads "<counterpart> · Persuaider", following the share page's title pattern. */
export async function generateMetadata({ params }: ChatPageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await auth().catch(() => null);
  if (!session) return { title: 'Persuaider' };
  const persona = await prisma.persona.findUnique({ where: { id }, select: { name: true } }).catch(() => null);
  return { title: persona ? `${persona.name} · Persuaider` : 'Persuaider' };
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
      learnerRole={conversation.role ? { name: conversation.role.name, brief: conversation.role.description } : null}
      initialMessages={conversation.messages.map((m) => ({
        ...m,
        role: m.role as 'user' | 'assistant',
      }))}
    />
  );
}
