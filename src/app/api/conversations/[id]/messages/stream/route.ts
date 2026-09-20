import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { LLMProviderFactory } from '@/lib/llm/providers/factory';
import { buildConversationContext } from '@/lib/llm/prompts';
import { parseMoodResponse } from '@/lib/llm/mood';
import { personaPromptSelect, scenarioPromptSelect } from '@/lib/conversation/context';
import { assertWithinBudget, estimatedResponse, recordLlmCall } from '@/lib/llm/usage';
import { LLM_MODELS } from '@/lib/llm/models';
import { BudgetExceededError } from '@/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();

  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json();
  const { content } = body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Message content is required' }), { status: 400 });
  }

  if (content.trim().length > 2000) {
    return new Response(JSON.stringify({ error: 'Message too long. Maximum 2000 characters.' }), { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      persona: { select: personaPromptSelect },
      scenario: { select: scenarioPromptSelect },
      messages: { orderBy: { createdAt: 'asc' as const }, take: 50 },
    },
  });

  if (!conversation) {
    return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
  }
  if (conversation.userId !== session.user.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
  }
  if (conversation.status !== 'in_progress') {
    return new Response(JSON.stringify({ error: 'Conversation is not active' }), { status: 400 });
  }

  try {
    await assertWithinBudget(session.user.id);
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return new Response(JSON.stringify({ error: error.message, code: 'budget_exceeded' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw error;
  }

  // Save user message
  const userMessage = await prisma.message.create({
    data: { conversationId: id, role: 'user', content: content.trim() },
  });

  // Build context
  const allMessages = [
    ...conversation.messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
    { role: 'user', content: content.trim() },
  ];
  const contextMessages = buildConversationContext(conversation.persona, allMessages, conversation.scenario);

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = '';

      try {
        const chain = LLMProviderFactory.getProviderChain();
        const streamingProvider = chain.getPrimaryStreamingProvider();

        const meter = { userId: session.user.id, purpose: 'turn_stream' as const, conversationId: id };
        if (streamingProvider && streamingProvider.generateStreamingResponse) {
          const gen = streamingProvider.generateStreamingResponse(contextMessages, { temperature: 0.8, maxTokens: 500 });
          for await (const chunk of gen) {
            fullContent += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`));
          }
          // Streams do not report token counts; record an estimate so the budget still moves.
          const modelName = LLM_MODELS[streamingProvider.name as keyof typeof LLM_MODELS] ?? 'unknown';
          await recordLlmCall(meter, estimatedResponse(contextMessages, fullContent, streamingProvider.name, modelName), { estimated: true });
        } else {
          // Fallback to non-streaming
          const response = await chain.generateResponse(contextMessages, { temperature: 0.8, maxTokens: 500 });
          fullContent = response.content;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: fullContent })}\n\n`));
          await recordLlmCall(meter, response);
        }

        // Parse mood from full response
        const parsed = parseMoodResponse(fullContent);

        // Save assistant message
        const assistantMessage = await prisma.message.create({
          data: {
            conversationId: id,
            role: 'assistant',
            content: parsed.content,
            mood: parsed.mood,
          },
        });

        // Send done event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'done',
          messageId: assistantMessage.id,
          mood: parsed.mood,
          content: parsed.content,
          userMessageId: userMessage.id,
        })}\n\n`));
      } catch (error) {
        console.error('Streaming error:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          message: 'Failed to generate response',
        })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
