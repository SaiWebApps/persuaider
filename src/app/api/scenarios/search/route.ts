import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check email verification
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true },
  });
  if (!currentUser || !currentUser.emailVerified) {
    return NextResponse.json({ error: 'Email not verified' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Search query must be at least 2 characters' }, { status: 400 });
  }

  const joinedIds = await prisma.userScenario.findMany({
    where: { userId: session.user.id },
    select: { scenarioId: true },
  });
  const joinedSet = new Set(joinedIds.map(j => j.scenarioId));

  const pattern = `%${query}%`;

  const scenarios = await prisma.scenario.findMany({
    where: {
      status: 'published',
      OR: [
        { title: { contains: query } },
        { description: { contains: query } },
        { userRole: { contains: query } },
        { aiRole: { contains: query } },
        { tags: { contains: query } },
      ],
    },
    include: {
      _count: { select: { personas: true, members: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const results = scenarios.map(s => ({
    id: s.id,
    title: s.title,
    description: s.description,
    userRole: s.userRole,
    aiRole: s.aiRole,
    joinCode: s.joinCode,
    isRestricted: !!s.accessCode,
    personaCount: s._count.personas,
    memberCount: s._count.members,
    alreadyJoined: joinedSet.has(s.id),
  }));

  return NextResponse.json({ scenarios: results });
}
