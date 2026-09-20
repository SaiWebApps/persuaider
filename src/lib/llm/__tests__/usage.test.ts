/**
 * @jest-environment node
 */
const db = {
  user: { findUnique: jest.fn() },
  llmCall: { aggregate: jest.fn(), create: jest.fn() },
};
jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return db;
  },
}));

import { assertWithinBudget, getDailyUsage, recordLlmCall, estimatedResponse, defaultBudgetFor } from '../usage';
import { costUsd, estimateTokens } from '../pricing';
import { BudgetExceededError } from '@/types';

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ role: 'user', dailyBudgetUsd: null });
  db.llmCall.aggregate.mockResolvedValue({ _sum: { costUsd: 0.5 }, _count: { _all: 3 } });
  db.llmCall.create.mockResolvedValue({});
});

describe('pricing', () => {
  it('prices known models per million tokens', () => {
    expect(costUsd('claude-sonnet-5', 1_000_000, 0)).toBeCloseTo(2);
    expect(costUsd('claude-sonnet-5', 0, 1_000_000)).toBeCloseTo(10);
    expect(costUsd('gemini-3.6-flash', 1_000_000, 1_000_000)).toBeCloseTo(4.5);
  });
  it('never prices an unknown model at zero', () => {
    expect(costUsd('brand-new-model', 1000, 1000)).toBeGreaterThan(0);
    expect(costUsd(undefined, 1000, 0)).toBeGreaterThan(0);
  });
  it('estimates tokens from text length', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

describe('getDailyUsage / assertWithinBudget', () => {
  it('uses the platform default when the user has no explicit budget', async () => {
    const usage = await getDailyUsage('u1');
    expect(usage).toEqual({ spentUsd: 0.5, calls: 3, budgetUsd: defaultBudgetFor('user') });
  });

  it('uses the explicit budget when set', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'user', dailyBudgetUsd: 0.25 });
    await expect(assertWithinBudget('u1')).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('passes when under budget and refuses at or over it', async () => {
    await expect(assertWithinBudget('u1')).resolves.toMatchObject({ spentUsd: 0.5 });
    db.llmCall.aggregate.mockResolvedValue({ _sum: { costUsd: defaultBudgetFor('user') }, _count: { _all: 9 } });
    await expect(assertWithinBudget('u1')).rejects.toThrow('Daily AI budget reached');
  });

  it('admins get the larger default', () => {
    expect(defaultBudgetFor('admin')).toBeGreaterThan(defaultBudgetFor('user'));
  });
});

describe('recordLlmCall', () => {
  it('stores tokens, model, provider and computed cost', async () => {
    await recordLlmCall(
      { userId: 'u1', purpose: 'turn', conversationId: 'c1' },
      { content: 'x', provider: 'anthropic', model: 'claude-sonnet-5', usage: { promptTokens: 1000, completionTokens: 100, totalTokens: 1100 } }
    );
    expect(db.llmCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1', conversationId: 'c1', purpose: 'turn', provider: 'anthropic', model: 'claude-sonnet-5',
        promptTokens: 1000, completionTokens: 100, costUsd: expect.closeTo(0.003, 6), estimated: false,
      }),
    });
  });

  it('never throws, even when the database write fails', async () => {
    db.llmCall.create.mockRejectedValue(new Error('db down'));
    await expect(recordLlmCall({ userId: 'u1', purpose: 'turn' }, { content: 'x' })).resolves.toBeUndefined();
  });

  it('estimatedResponse fills usage from text for streamed calls', () => {
    const r = estimatedResponse([{ role: 'user', content: 'a'.repeat(40) }], 'b'.repeat(80), 'anthropic', 'claude-sonnet-5');
    expect(r.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    expect(r.model).toBe('claude-sonnet-5');
  });
});
