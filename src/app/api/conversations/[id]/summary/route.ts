import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { evaluateConversation } from '@/lib/llm/evaluation';

// POST /api/conversations/[id]/summary - Generate summary for completed conversation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        persona: {
          select: {
            name: true,
            description: true,
            roleType: true,
            characteristics: true,
          },
        },
        scenario: true,
        summary: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (conversation.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    if (conversation.summary) {
      return NextResponse.json({ summary: conversation.summary });
    }

    // Evaluate the conversation using LLM
    let evaluation;
    try {
      evaluation = await evaluateConversation(
        conversation.messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
        conversation.persona,
        conversation.scenario
      );
    } catch {
      evaluation = null;
    }

    const summary = await prisma.summary.create({
      data: {
        conversationId: id,
        overallScore: evaluation?.overallScore ?? null,
        winningArguments: JSON.stringify(evaluation?.winningArguments ?? []),
        llmFeedback: evaluation?.llmFeedback ? JSON.stringify(evaluation.llmFeedback) : null,
        frameworkScores: evaluation?.frameworkScores ? JSON.stringify(evaluation.frameworkScores) : null,
      },
    });

    await prisma.conversation.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
}

// GET /api/conversations/[id]/summary - Get existing summary
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const summary = await prisma.summary.findUnique({
      where: { conversationId: id },
      include: {
        conversation: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!summary) {
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 404 }
      );
    }

    if (summary.conversation.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    );
  }
}
