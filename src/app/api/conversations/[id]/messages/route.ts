import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { generatePersonaResponse } from '@/lib/llm';
import { parseMoodResponse } from '@/lib/llm/mood';
import { DEFAULT_MOOD } from '@/types';

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
        persona: {
          select: {
            name: true,
            description: true,
            roleType: true,
            characteristics: true,
          },
        },
        scenario: {
          select: {
            title: true,
            description: true,
            userRole: true,
            aiRole: true,
            evaluationCriteria: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
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
      ...conversation.messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: 'user',
        content: content.trim(),
      },
    ];

    // Generate AI response using LLM with scenario context
    let aiResponse: string;
    let aiMood: string = DEFAULT_MOOD;

    try {
      const llmResponse = await generatePersonaResponse(
        conversation.persona,
        allMessages,
        conversation.scenario
      );

      const parsed = parseMoodResponse(llmResponse.content);
      aiResponse = parsed.content;
      aiMood = parsed.mood;
    } catch (error) {
      console.error('LLM generation error:', error);
      aiResponse = generatePlaceholderResponse();
      aiMood = DEFAULT_MOOD;
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

function generatePlaceholderResponse(): string {
  const responses = [
    "I hear what you're saying, but I'm still not convinced. Can you explain more?",
    "That's an interesting point, but what about the downsides?",
    "I understand your perspective, but I still have my concerns.",
    "You make a good argument, but I need more evidence.",
    "I appreciate you trying to convince me, but I'm not there yet.",
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}
