import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const joinedIds = await prisma.userScenario.findMany({
    where: { userId: session.user.id },
    select: { scenarioId: true },
  });
  const joinedSet = new Set(joinedIds.map(j => j.scenarioId));

  const scenarios = await prisma.scenario.findMany({
    where: { visibility: 'public', status: 'published' },
    include: {
      _count: { select: { personas: true, members: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const available = scenarios.filter(s => !joinedSet.has(s.id));

  return NextResponse.json({
    scenarios: available.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      userRole: s.userRole,
      aiRole: s.aiRole,
      joinCode: s.joinCode,
      personaCount: s._count.personas,
      memberCount: s._count.members,
    })),
  });
}
