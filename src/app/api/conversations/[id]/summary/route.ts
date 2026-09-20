import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { evaluateConversation } from '@/lib/llm/evaluation';
import { extractDealState } from '@/lib/llm/deal';
import { readEvaluationCriteria, readIssues } from '@/lib/codec/scenario';
import { weightedOverall } from '@/lib/scoring/frameworks';
import { computeDealOutcome } from '@/lib/scoring/deal';
import { assertWithinBudget } from '@/lib/llm/usage';
import { BudgetExceededError } from '@/types';

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

    // Check email verification
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true },
    });
    if (!currentUser || !currentUser.emailVerified) {
      return NextResponse.json(
        { error: 'Email not verified' },
        { status: 403 }
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

    try {
      await assertWithinBudget(session.user.id);
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        return NextResponse.json({ error: error.message, code: 'budget_exceeded' }, { status: 429 });
      }
      throw error;
    }

    const transcript = conversation.messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }));
    const issues = readIssues(conversation.scenario.issues);
    const criteria = readEvaluationCriteria(conversation.scenario.evaluationCriteria);

    // Deal outcome: the model extracts the numbers, the arithmetic is ours.
    let deal = null;
    if (issues.length > 0) {
      try {
        const state = await extractDealState(transcript, issues, conversation.persona.name, { userId: session.user.id, purpose: 'deal', conversationId: id });
        // No usable extraction means "unknown": store nothing rather than show a false "No deal".
        deal = state ? computeDealOutcome(state, issues) : null;
      } catch (error) {
        console.error('[summary] deal extraction failed', error);
      }
    }

    // Coaching evaluation. The overall score is the weighted mean of the
    // per-framework scores, computed here; a failed evaluation is "not scored".
    let evaluation;
    try {
      evaluation = await evaluateConversation(transcript, conversation.persona, conversation.scenario, deal ?? undefined, {
        userId: session.user.id,
        purpose: 'evaluation',
        conversationId: id,
      });
    } catch (error) {
      console.error('[summary] evaluation failed', error);
      evaluation = null;
    }
    const frameworkScores = evaluation?.frameworkScores ?? null;
    const overallScore = weightedOverall(frameworkScores, criteria);

    const summary = await prisma.summary.create({
      data: {
        conversationId: id,
        overallScore,
        winningArguments: JSON.stringify(evaluation?.winningArguments ?? []),
        llmFeedback: evaluation?.llmFeedback && overallScore !== null ? JSON.stringify(evaluation.llmFeedback) : null,
        frameworkScores: frameworkScores && overallScore !== null ? JSON.stringify(frameworkScores) : null,
        deal: deal ? JSON.stringify(deal) : null,
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
