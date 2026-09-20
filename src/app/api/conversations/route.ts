import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { startOrResumeConversation } from '@/lib/conversation/start';
import { AuthorizationError, NotFoundError } from '@/types';

// GET /api/conversations - List conversations for current user
export async function GET() {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check email verification
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

    const conversations = await prisma.conversation.findMany({
      where: { userId: session.user.id },
      include: {
        persona: {
          select: {
            id: true,
            name: true,
            description: true,
            roleType: true,
          },
        },
        scenario: {
          select: {
            id: true,
            title: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        summary: true,
      },
      orderBy: { startedAt: 'desc' },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}

// POST /api/conversations - Start (or resume) a conversation with a persona
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { personaId, scenarioId } = body;
    if (!personaId || !scenarioId) {
      return NextResponse.json({ error: 'Persona ID and Scenario ID are required' }, { status: 400 });
    }

    const { conversation } = await startOrResumeConversation({
      userId: session.user.id,
      role: session.user.role,
      personaId,
      scenarioId,
    });

    return NextResponse.json({ conversation });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Persona not found in this scenario' }, { status: 404 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error creating conversation:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
