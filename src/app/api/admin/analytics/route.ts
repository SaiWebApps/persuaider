import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [totalConversations, completedConversations] = await Promise.all([
    prisma.conversation.count(),
    prisma.conversation.count({ where: { status: 'completed' } }),
  ]);

  const completionRate = totalConversations > 0
    ? completedConversations / totalConversations
    : 0;

  const scoreAgg = await prisma.summary.aggregate({
    _avg: { overallScore: true },
    where: { overallScore: { not: null } },
  });

  const averageScore = scoreAgg._avg.overallScore ?? null;

  const summaries = await prisma.summary.findMany({
    where: { overallScore: { not: null } },
    select: { overallScore: true, generatedAt: true },
    orderBy: { generatedAt: 'asc' },
  });

  const weekMap = new Map<string, { total: number; count: number }>();
  for (const s of summaries) {
    const date = new Date(s.generatedAt);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(date);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);
    const weekKey = weekStart.toISOString().split('T')[0];

    const existing = weekMap.get(weekKey) || { total: 0, count: 0 };
    existing.total += s.overallScore!;
    existing.count += 1;
    weekMap.set(weekKey, existing);
  }

  const scoresOverTime = Array.from(weekMap.entries()).map(([week, data]) => ({
    week,
    avgScore: Math.round((data.total / data.count) * 100) / 100,
    count: data.count,
  }));

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      conversations: {
        select: {
          id: true,
          status: true,
          summary: { select: { overallScore: true } },
        },
      },
    },
  });

  const perUser = users.map((user) => {
    const userConvos = user.conversations;
    const completed = userConvos.filter((c) => c.status === 'completed');
    const scores = userConvos
      .map((c) => c.summary?.overallScore)
      .filter((s): s is number => s !== null && s !== undefined);
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null;

    return {
      userId: user.id,
      username: user.username,
      totalConversations: userConvos.length,
      completedConversations: completed.length,
      averageScore: avgScore,
    };
  });

  const scenarios = await prisma.scenario.findMany({
    select: {
      id: true,
      title: true,
      conversations: {
        select: {
          id: true,
          status: true,
          summary: { select: { overallScore: true } },
        },
      },
    },
  });

  const perScenario = scenarios.map((scenario) => {
    const scenConvos = scenario.conversations;
    const completed = scenConvos.filter((c) => c.status === 'completed');
    const scores = scenConvos
      .map((c) => c.summary?.overallScore)
      .filter((s): s is number => s !== null && s !== undefined);
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null;

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      totalConversations: scenConvos.length,
      completedConversations: completed.length,
      averageScore: avgScore,
    };
  });

  return NextResponse.json({
    overview: {
      totalConversations,
      completedConversations,
      completionRate: Math.round(completionRate * 1000) / 1000,
      averageScore,
    },
    scoresOverTime,
    perUser,
    perScenario,
  });
}