import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ChatContainer } from '@/components/chat/ChatContainer';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  // Get or create conversation
  let conversation = await prisma.conversation.findFirst({
    where: {
      userId: session.user.id,
      personaId: id,
      status: 'in_progress',
    },
    include: {
      persona: {
        select: {
          id: true,
          name: true,
          description: true,
          roleType: true,
          characteristics: true,
          scenarioId: true,
        },
      },
      scenario: {
        select: {
          id: true,
          title: true,
          userRole: true,
          aiRole: true,
        },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  // If no existing conversation, create one
  if (!conversation) {
    const persona = await prisma.persona.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        roleType: true,
        characteristics: true,
        scenarioId: true,
        initialGreeting: true,
      },
    });

    if (!persona) {
      redirect('/dashboard');
    }

    const newConversation = await prisma.conversation.create({
      data: {
        userId: session.user.id,
        personaId: id,
        scenarioId: persona.scenarioId,
        status: 'in_progress',
      },
    });

    const greeting = persona.initialGreeting || `Hello, I'm ${persona.name}. Let's discuss.`;
    await prisma.message.create({
      data: {
        conversationId: newConversation.id,
        role: 'assistant',
        content: greeting,
        mood: 'neutral',
      },
    });

    conversation = await prisma.conversation.findUnique({
      where: { id: newConversation.id },
      include: {
        persona: {
          select: {
            id: true,
            name: true,
            description: true,
            roleType: true,
            characteristics: true,
            scenarioId: true,
          },
        },
        scenario: {
          select: {
            id: true,
            title: true,
            userRole: true,
            aiRole: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  if (!conversation) {
    redirect('/dashboard');
  }

  return (
    <ChatContainer
      conversationId={conversation.id}
      persona={conversation.persona}
      scenarioTitle={conversation.scenario.title}
      initialMessages={conversation.messages.map(m => ({
        ...m,
        role: m.role as 'user' | 'assistant',
      }))}
    />
  );
}
