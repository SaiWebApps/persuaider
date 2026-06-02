import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true },
    });
    if (!currentUser || !currentUser.emailVerified) {
      return NextResponse.json(
        { error: 'Email not verified' },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        personaId: true,
        scenarioId: true,
        status: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (conversation.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (conversation.status !== 'completed') {
      return NextResponse.json(
        { error: 'Conversation is not completed' },
        { status: 400 }
      );
    }

    const persona = await prisma.persona.findUnique({
      where: { id: conversation.personaId },
      select: { id: true, name: true, initialGreeting: true },
    });

    if (!persona) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    const existingInProgress = await prisma.conversation.findFirst({
      where: {
        userId: session.user.id,
        personaId: conversation.personaId,
        scenarioId: conversation.scenarioId,
        status: 'in_progress',
      },
      select: { id: true },
    });

    if (existingInProgress) {
      return NextResponse.json(
        { conversationId: existingInProgress.id },
        { status: 200 }
      );
    }

    const newConversation = await prisma.conversation.create({
      data: {
        userId: session.user.id,
        personaId: conversation.personaId,
        scenarioId: conversation.scenarioId,
        status: 'in_progress',
      },
    });

    const greeting = persona.initialGreeting || `Hello, I'm ${persona.name}. Let's discuss.`;
    await prisma.message.create({
      data: {
        conversationId: newConversation.id,
        role: 'assistant',
        content: greeting,
      },
    });

    return NextResponse.json(
      { conversationId: newConversation.id },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating reattempt:', error);
    return NextResponse.json(
      { error: 'Failed to create reattempt' },
      { status: 500 }
    );
  }
}
