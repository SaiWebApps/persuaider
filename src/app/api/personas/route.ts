import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { assertCanPractice } from '@/lib/conversation/start';
import { AuthorizationError, NotFoundError } from '@/types';

// GET /api/personas - List personas for a scenario
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

    await assertCanPractice(session.user.id, session.user.role, scenarioId);

    const personas = await prisma.persona.findMany({
      where: { scenarioId },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, scenarioId: true, name: true, description: true, roleType: true, initialGreeting: true, avatarUrl: true, displayOrder: true },
    });

    return NextResponse.json({ personas });
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof NotFoundError) return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    console.error('Error fetching personas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch personas' },
      { status: 500 }
    );
  }
}
