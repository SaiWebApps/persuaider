import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { joinCode, accessCode } = body;

    if (!joinCode || typeof joinCode !== 'string') {
      return NextResponse.json({ error: 'Join code is required' }, { status: 400 });
    }

    const scenario = await prisma.scenario.findUnique({
      where: { joinCode: joinCode.trim().toUpperCase() },
    });

    if (!scenario || scenario.status !== 'published') {
      return NextResponse.json({ error: 'Invalid or inactive join code' }, { status: 404 });
    }

    if (scenario.accessCode) {
      if (!accessCode || accessCode !== scenario.accessCode) {
        return NextResponse.json({ error: 'Access code required', requiresAccessCode: true }, { status: 403 });
      }
    }

    const existing = await prisma.userScenario.findUnique({
      where: { userId_scenarioId: { userId: session.user.id, scenarioId: scenario.id } },
    });

    if (existing) {
      return NextResponse.json({ error: 'You have already joined this scenario' }, { status: 409 });
    }

    await prisma.userScenario.create({
      data: { userId: session.user.id, scenarioId: scenario.id },
    });

    return NextResponse.json({
      scenario: { id: scenario.id, title: scenario.title, description: scenario.description },
    });
  } catch (error) {
    console.error('Error joining scenario:', error);
    return NextResponse.json({ error: 'Failed to join scenario' }, { status: 500 });
  }
}
