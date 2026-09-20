import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { startOrResumeConversation } from '@/lib/conversation/start';
import { AuthorizationError, NotFoundError } from '@/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/conversations/[id]/reattempt — start a fresh attempt at the same persona
export async function POST(_request: Request, context: RouteContext) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const previous = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, userId: true, personaId: true, scenarioId: true, status: true },
    });
    if (!previous) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (previous.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (previous.status !== 'completed') {
      return NextResponse.json({ error: 'Conversation is not completed' }, { status: 400 });
    }

    const { conversation, created } = await startOrResumeConversation({
      userId: session.user.id,
      role: session.user.role,
      personaId: previous.personaId,
      scenarioId: previous.scenarioId,
    });

    return NextResponse.json({ conversationId: conversation.id }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error creating reattempt:', error);
    return NextResponse.json({ error: 'Failed to create reattempt' }, { status: 500 });
  }
}
