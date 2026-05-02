import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

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

// POST /api/conversations - Create new conversation
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { personaId, scenarioId } = body;

    if (!personaId || !scenarioId) {
      return NextResponse.json(
        { error: 'Persona ID and Scenario ID are required' },
        { status: 400 }
      );
    }

    // Check if persona exists and belongs to the scenario
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
    });

    if (!persona || persona.scenarioId !== scenarioId) {
      return NextResponse.json(
        { error: 'Persona not found in this scenario' },
        { status: 404 }
      );
    }

    // Check if there's already an in-progress conversation for this persona+user
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        userId: session.user.id,
        personaId,
        scenarioId,
        status: 'in_progress',
      },
    });

    if (existingConversation) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: existingConversation.id },
        include: {
          persona: {
            select: {
              id: true,
              name: true,
              description: true,
              roleType: true,
              characteristics: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      return NextResponse.json({ conversation });
    }

    // Create new conversation
    const conversation = await prisma.conversation.create({
      data: {
        userId: session.user.id,
        personaId,
        scenarioId,
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
          },
        },
        messages: true,
      },
    });

    // Create initial greeting message from persona
    const greeting = persona.initialGreeting || `Hello, I'm ${persona.name}. Let's discuss.`;
    const greetingMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: greeting,
      },
    });

    return NextResponse.json({
      conversation: {
        ...conversation,
        messages: [greetingMessage],
      },
    });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json(
      { error: 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
