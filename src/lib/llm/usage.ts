import { prisma } from '@/lib/db/client';
import { BudgetExceededError } from '@/types';
import { costUsd, estimateTokens } from './pricing';
import type { LLMMessage, LLMResponse } from './types';

/**
 * Every model call is metered against the user who caused it. Budgets are
 * per user per UTC day; hitting the budget refuses the call before it is
 * made, so a runaway session cannot spend past the cap.
 */

export type LlmPurpose = 'turn' | 'turn_stream' | 'evaluation' | 'deal' | 'generation';

export interface Meter {
  userId: string;
  purpose: LlmPurpose;
  conversationId?: string;
}

const DEFAULT_BUDGET_USD = Number(process.env.DEFAULT_DAILY_AI_BUDGET_USD ?? '2');
const DEFAULT_ADMIN_BUDGET_USD = Number(process.env.DEFAULT_ADMIN_DAILY_AI_BUDGET_USD ?? '10');

export function defaultBudgetFor(role: string): number {
  return role === 'admin' ? DEFAULT_ADMIN_BUDGET_USD : DEFAULT_BUDGET_USD;
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface DailyUsage {
  spentUsd: number;
  calls: number;
  budgetUsd: number;
}

export async function getDailyUsage(userId: string): Promise<DailyUsage> {
  const [user, agg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, dailyBudgetUsd: true } }),
    prisma.llmCall.aggregate({
      where: { userId, createdAt: { gte: startOfUtcDay() } },
      _sum: { costUsd: true },
      _count: { _all: true },
    }),
  ]);
  const budgetUsd = user?.dailyBudgetUsd ?? defaultBudgetFor(user?.role ?? 'user');
  return { spentUsd: agg._sum.costUsd ?? 0, calls: agg._count._all, budgetUsd };
}

/** Throws BudgetExceededError when today's spend has reached the user's budget. */
export async function assertWithinBudget(userId: string): Promise<DailyUsage> {
  const usage = await getDailyUsage(userId);
  if (usage.spentUsd >= usage.budgetUsd) throw new BudgetExceededError(usage.spentUsd, usage.budgetUsd);
  return usage;
}

/**
 * Record one completed call. Never throws: a metering failure must not fail
 * the user's request, but it is logged loudly.
 */
export async function recordLlmCall(meter: Meter, response: LLMResponse, options?: { estimated?: boolean }): Promise<void> {
  const promptTokens = response.usage?.promptTokens ?? 0;
  const completionTokens = response.usage?.completionTokens ?? 0;
  const model = response.model ?? 'unknown';
  try {
    await prisma.llmCall.create({
      data: {
        userId: meter.userId,
        conversationId: meter.conversationId ?? null,
        purpose: meter.purpose,
        provider: response.provider ?? 'unknown',
        model,
        promptTokens,
        completionTokens,
        costUsd: costUsd(model, promptTokens, completionTokens),
        estimated: options?.estimated ?? false,
      },
    });
  } catch (error) {
    console.error('[usage] failed to record LLM call', meter, error);
  }
}

/** For streamed calls the provider reports no usage; estimate from text. */
export function estimatedResponse(messages: LLMMessage[], completion: string, provider: string, model: string): LLMResponse {
  const promptTokens = estimateTokens(messages.map((m) => m.content).join('\n'));
  const completionTokens = estimateTokens(completion);
  return { content: completion, provider, model, usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } };
}
