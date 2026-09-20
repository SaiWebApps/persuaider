/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/conversations/[id]/messages routes.
 * Focuses on edge cases: empty content, missing conversation, wrong user,
 * completed conversation, and LLM failure fallback.
 */

// Budget metering is tested in src/lib/llm/__tests__/usage.test.ts; routes get a permissive fake.
jest.mock('@/lib/llm/usage', () => ({
  assertWithinBudget: jest.fn().mockResolvedValue({ spentUsd: 0, calls: 0, budgetUsd: 2 }),
  recordLlmCall: jest.fn().mockResolvedValue(undefined),
  getDailyUsage: jest.fn().mockResolvedValue({ spentUsd: 0, calls: 0, budgetUsd: 2 }),
  estimatedResponse: (_m: unknown, content: string, provider: string, model: string) => ({
    content, provider, model, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  }),
}));


const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockConversation = {
  findUnique: jest.fn(),
};
const mockMessage = {
  create: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
};
const mockUserDb = {
  findUnique: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      conversation: mockConversation,
      message: mockMessage,
      user: mockUserDb,
    };
  },
}));

const mockGeneratePersonaResponse = jest.fn();
jest.mock('@/lib/llm', () => ({
  generatePersonaResponse: (...args: unknown[]) =>
    mockGeneratePersonaResponse(...args),
}));

jest.mock('@/lib/llm/mood', () => ({
  parseMoodResponse: (raw: string) => ({ content: raw, mood: 'neutral' }),
}));

jest.mock('@/types', () => ({
  ...jest.requireActual('@/types'),
  DEFAULT_MOOD: 'neutral',
}));

import { POST } from '../conversations/[id]/messages/route';
import { assertWithinBudget } from '@/lib/llm/usage';
import { BudgetExceededError } from '@/types';
import { NextRequest } from 'next/server';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/conversations/c1/messages', {
    method: 'POST',
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : { body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } }),
  });
}

/** Standard conversation fixture used by happy-path tests. */
function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: 'u1',
    status: 'in_progress',
    persona: {
      name: 'Alex',
      description: 'A tough negotiator',
      roleType: 'Skeptic',
      characteristics: null,
    },
    scenario: {
      title: 'Budget',
      description: 'Budget negotiation',
      userRole: 'Manager',
      aiRole: 'CFO',
      evaluationCriteria: '{}',
    },
    messages: [],
    ...overrides,
  };
}

describe('POST /api/conversations/[id]/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: user is verified
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  // ---- Auth checks ----

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(401);
  });

  // ---- Validation ----

  it('returns 400 when content is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const req = createRequest({});
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/content/i);
  });

  it('returns 400 when content is empty string', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const req = createRequest({ content: '' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is whitespace only', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const req = createRequest({ content: '   ' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is not a string', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const req = createRequest({ content: 42 });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
  });

  // ---- Conversation lookup ----

  it('returns 404 when conversation does not exist', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(null);
    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  // ---- Authorization ----

  it('returns 403 when conversation belongs to another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(
      makeConversation({ userId: 'other-user' })
    );
    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(403);
  });

  // ---- Status check ----

  it('returns 400 when conversation is completed', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(
      makeConversation({ status: 'completed' })
    );
    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not active/i);
  });

  it('returns 400 when conversation is abandoned', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(
      makeConversation({ status: 'abandoned' })
    );
    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
  });

  // ---- Happy path ----

  it('creates user message and AI response on success', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());

    const userMsg = { id: 'm1', conversationId: 'c1', role: 'user', content: 'hello' };
    const aiMsg = {
      id: 'm2',
      conversationId: 'c1',
      role: 'assistant',
      content: 'I see your point.',
      mood: 'neutral',
    };
    mockMessage.create
      .mockResolvedValueOnce(userMsg)   // user message
      .mockResolvedValueOnce(aiMsg);    // assistant message
    mockGeneratePersonaResponse.mockResolvedValue({
      content: 'I see your point.',
    });

    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.userMessage.role).toBe('user');
    expect(data.assistantMessage.role).toBe('assistant');
    expect(data.conversationStatus).toBe('in_progress');
  });

  // ---- LLM failure fallback ----

  it('returns 502 and removes the pending user message when the model cannot reply (no canned placeholder)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
    mockConversation.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-1', status: 'in_progress', persona: {}, scenario: {}, messages: [] });
    mockMessage.create.mockResolvedValue({ id: 'm1', role: 'user', content: 'hi' });
    mockMessage.delete = jest.fn().mockResolvedValue({});
    mockGeneratePersonaResponse.mockRejectedValue(new Error('all providers failed'));
    const res = await POST(createRequest({ content: 'hi' }), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(502);
    expect(mockMessage.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect((await res.json()).error).toContain('could not reply');
  });

  it('trims whitespace from message content', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());

    mockMessage.create
      .mockResolvedValueOnce({ id: 'm1', role: 'user', content: 'hello' })
      .mockResolvedValueOnce({ id: 'm2', role: 'assistant', content: 'reply' });
    mockGeneratePersonaResponse.mockResolvedValue({ content: 'reply' });

    const req = createRequest({ content: '  hello  ' });
    await POST(req, createParams('c1'));

    // The first create call is the user message; content should be trimmed
    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'hello' }),
      })
    );
  });
});

describe('POST /api/conversations/[id]/messages - budget', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 429 with a plain message when the daily budget is reached, before any model call', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
    mockConversation.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-1', status: 'in_progress', persona: {}, scenario: {}, messages: [] });
    (assertWithinBudget as jest.Mock).mockRejectedValueOnce(new BudgetExceededError(2.01, 2));
    const req = new NextRequest('http://localhost:3000/api/conversations/c1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'hi' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.code).toBe('budget_exceeded');
    expect(data.error).toContain('Daily AI budget reached');
    expect(mockMessage.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/conversations/[id]/messages - win condition', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 limit_reached once the learner has used all messages, before any model call', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1', userId: 'user-1', status: 'in_progress', persona: {},
      scenario: { winCondition: JSON.stringify({ type: 'manual', maxMessages: 2 }) },
      messages: [{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'd' }],
    });
    mockMessage.count = jest.fn().mockResolvedValue(2);
    const res = await POST(createRequest({ content: 'one more' }), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('limit_reached');
    expect(mockMessage.count).toHaveBeenCalledWith({ where: { conversationId: 'c1', role: 'user' } });
    expect(mockMessage.create).not.toHaveBeenCalled();
    expect(mockGeneratePersonaResponse).not.toHaveBeenCalled();
  });
});
