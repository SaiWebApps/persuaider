import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { generatePersonaResponse } from '@/lib/llm';
import { parseMoodResponse } from '@/lib/llm/mood';
import { DEFAULT_MOOD } from '@/types';
import { personaPromptSelect, scenarioPromptSelect } from '@/lib/conversation/context';
import { assertWithinBudget } from '@/lib/llm/usage';
import { BudgetExceededError } from '@/types';
import { winState } from '@/lib/conversation/win';
import { readWinCondition } from '@/lib/codec/scenario';

// POST /api/conversations/[id]/messages - Add message to conversation
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

    const body = await request.json();
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message content is required' },
        { status: 400 }
      );
    }

    if (content.trim().length > 2000) {
      return NextResponse.json(
        { error: 'Message too long. Maximum 2000 characters.' },
        { status: 400 }
      );
    }

    // Verify conversation exists and belongs to user
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        persona: { select: personaPromptSelect },
        scenario: { select: scenarioPromptSelect },
        // Latest 50 messages (returned newest first; reversed below), so long sessions
        // keep the recent context rather than the opening.
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
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

    if (conversation.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Conversation is not active' },
        { status: 400 }
      );
    }

    const userTurns = await prisma.message.count({ where: { conversationId: id, role: 'user' } });
    if (winState(Array.from({ length: userTurns }, () => ({ role: 'user' })), readWinCondition(conversation.scenario.winCondition)).limitReached) {
      return NextResponse.json({ error: 'You have used all the messages for this scenario. End the negotiation to get your summary.', code: 'limit_reached' }, { status: 400 });
    }

    try {
      await assertWithinBudget(session.user.id);
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        return NextResponse.json({ error: error.message, code: 'budget_exceeded' }, { status: 429 });
      }
      throw error;
    }

    // Create user message
    const userMessage = await prisma.message.create({
      data: {
        conversationId: id,
        role: 'user',
        content: content.trim(),
      },
    });

    // Prepare message history
    const allMessages = [
      ...[...conversation.messages].reverse().map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: 'user',
        content: content.trim(),
      },
    ];

    // Generate the persona's reply. An empty reply is retried once; a failure is an
    // honest 502, never a canned sentence pretending to be the persona.
    let aiResponse = '';
    let aiMood: string = DEFAULT_MOOD;
    try {
      for (let attempt = 0; attempt < 2 && !aiResponse.trim(); attempt++) {
        const llmResponse = await generatePersonaResponse(conversation.persona, allMessages, conversation.scenario, {
          meter: { userId: session.user.id, purpose: 'turn', conversationId: id },
        });
        const parsed = parseMoodResponse(llmResponse.content);
        aiResponse = parsed.content;
        aiMood = parsed.mood;
      }
    } catch (error) {
      console.error('LLM generation error:', error);
    }
    if (!aiResponse.trim()) {
      await prisma.message.delete({ where: { id: userMessage.id } }).catch(() => undefined);
      return NextResponse.json({ error: 'The counterpart could not reply right now. Please send your message again.' }, { status: 502 });
    }

    // Create AI message
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: id,
        role: 'assistant',
        content: aiResponse,
        mood: aiMood,
      },
    });

    return NextResponse.json({
      userMessage,
      assistantMessage,
      conversationStatus: conversation.status,
    });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    );
  }
}
