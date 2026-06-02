import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      user: { select: { username: true, email: true } },
      persona: { select: { name: true, roleType: true } },
      scenario: { select: { title: true } },
      messages: {
        select: {
          role: true,
          content: true,
          mood: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      summary: {
        select: {
          overallScore: true,
          winningArguments: true,
          llmFeedback: true,
          frameworkScores: true,
        },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}