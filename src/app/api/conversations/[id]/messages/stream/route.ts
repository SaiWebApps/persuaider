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
import { winState } from '@/lib/conversation/win';
import { readWinCondition } from '@/lib/codec/scenario';

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
      // Latest 50 messages (newest first; reversed below).
      messages: { orderBy: { createdAt: 'desc' as const }, take: 50 },
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

  const userTurns = await prisma.message.count({ where: { conversationId: id, role: 'user' } });
  if (winState(Array.from({ length: userTurns }, () => ({ role: 'user' })), readWinCondition(conversation.scenario.winCondition)).limitReached) {
    return new Response(JSON.stringify({ error: 'You have used all the messages for this scenario. End the negotiation to get your summary.', code: 'limit_reached' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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
    ...[...conversation.messages].reverse().map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
    { role: 'user', content: content.trim() },
  ];
  const contextMessages = buildConversationContext(conversation.persona, allMessages, conversation.scenario);

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullContent = '';
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true; // client went away
        }
      };
      let billed = false;
      const meter = { userId: session.user.id, purpose: 'turn_stream' as const, conversationId: id };
      const billEstimate = async (provider: string) => {
        if (billed || !fullContent) return;
        billed = true;
        const modelName = LLM_MODELS[provider as keyof typeof LLM_MODELS] ?? 'unknown';
        await recordLlmCall(meter, estimatedResponse(contextMessages, fullContent, provider, modelName), { estimated: true });
      };
      let providerName = 'unknown';

      try {
        const chain = LLMProviderFactory.getProviderChain();
        const streamingProvider = chain.getPrimaryStreamingProvider();

        if (streamingProvider && streamingProvider.generateStreamingResponse) {
          providerName = streamingProvider.name;
          const gen = streamingProvider.generateStreamingResponse(contextMessages, { temperature: 0.8, maxTokens: 500 });
          for await (const chunk of gen) {
            fullContent += chunk;
            send({ type: 'chunk', text: chunk });
          }
          // Streams do not report token counts; record an estimate so the budget still moves.
          await billEstimate(providerName);
        } else {
          // Fallback to non-streaming
          const response = await chain.generateResponse(contextMessages, { temperature: 0.8, maxTokens: 500 });
          fullContent = response.content;
          send({ type: 'chunk', text: fullContent });
          billed = true;
          await recordLlmCall(meter, response);
        }

        // Parse mood from full response
        let parsed = parseMoodResponse(fullContent);
        if (!parsed.content.trim()) {
          // Empty reply (rare): one non-streaming retry before reporting an error.
          console.warn('[stream] empty persona reply; retrying once');
          const retry = await chain.generateResponse(contextMessages, { temperature: 0.8, maxTokens: 500 });
          await recordLlmCall(meter, retry);
          parsed = parseMoodResponse(retry.content);
          if (!parsed.content.trim()) throw new Error('empty persona reply after retry');
          send({ type: 'chunk', text: parsed.content });
        }

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
        send({
          type: 'done',
          messageId: assistantMessage.id,
          mood: parsed.mood,
          content: parsed.content,
          userMessageId: userMessage.id,
        });
      } catch (error) {
        console.error('Streaming error:', error);
        // Tokens were consumed even if the client disconnected mid-stream: bill what streamed.
        await billEstimate(providerName);
        await prisma.message.delete({ where: { id: userMessage.id } }).catch(() => undefined);
        send({ type: 'error', message: 'The counterpart could not reply right now. Please send your message again.' });
      } finally {
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        }
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
