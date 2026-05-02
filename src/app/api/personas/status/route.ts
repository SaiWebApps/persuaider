import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

// GET /api/personas/status?scenarioId=[scenarioId] - Get persona status for a scenario
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const scenarioId = searchParams.get('scenarioId');

    if (!scenarioId) {
      return NextResponse.json(
        { error: 'scenarioId is required' },
        { status: 400 }
      );
    }

    const personas = await prisma.persona.findMany({
      where: { scenarioId },
      select: {
        id: true,
        name: true,
      },
    });

    // Get in-progress conversations for current user in this scenario
    const conversations = await prisma.conversation.findMany({
      where: {
        userId: session.user.id,
        scenarioId,
        status: 'in_progress',
      },
      select: {
        personaId: true,
      },
    });

    // Get completed conversations
    const completedConversations = await prisma.conversation.findMany({
      where: {
        userId: session.user.id,
        scenarioId,
        status: 'completed',
      },
      select: {
        personaId: true,
      },
    });

    const personaStatuses = personas.map((persona) => {
      const inProgress = conversations.some((c) => c.personaId === persona.id);
      const completed = completedConversations.some((c) => c.personaId === persona.id);

      return {
        id: persona.id,
        name: persona.name,
        status: completed ? 'completed' : inProgress ? 'in_progress' : 'available',
      };
    });

    return NextResponse.json({ personas: personaStatuses });
  } catch (error) {
    console.error('Error fetching persona status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch persona status' },
      { status: 500 }
    );
  }
}
