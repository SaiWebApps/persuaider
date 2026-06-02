import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  let limit = parseInt(searchParams.get('limit') || '20', 10);
  const status = searchParams.get('status') || undefined;
  const userId = searchParams.get('userId') || undefined;

  if (page < 1 || isNaN(page)) {
    return NextResponse.json({ error: 'Invalid page parameter' }, { status: 400 });
  }

  if (limit < 1 || isNaN(limit)) {
    return NextResponse.json({ error: 'Invalid limit parameter' }, { status: 400 });
  }

  // Cap limit at 100
  if (limit > 100) {
    limit = 100;
  }

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (userId) where.userId = userId;

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      select: {
        id: true,
        userId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        user: { select: { username: true } },
        persona: { select: { name: true } },
        scenario: { select: { title: true } },
        _count: { select: { messages: true } },
        summary: { select: { overallScore: true } },
      },
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.conversation.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      userId: c.userId,
      username: c.user.username,
      personaName: c.persona.name,
      scenarioTitle: c.scenario.title,
      status: c.status,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      messageCount: c._count.messages,
      score: c.summary?.overallScore ?? null,
    })),
    total,
    page,
    totalPages,
  });
}