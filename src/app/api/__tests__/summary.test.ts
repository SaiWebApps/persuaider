/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/conversations/[id]/summary route.
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
  update: jest.fn(),
};
const mockSummary = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  update: jest.fn(),
};
const mockUserDb = {
  findUnique: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      conversation: mockConversation,
      summary: mockSummary,
      user: mockUserDb,
    };
  },
}));

const mockEvaluateConversation = jest.fn();
jest.mock('@/lib/llm/evaluation', () => ({
  evaluateConversation: (...args: unknown[]) => mockEvaluateConversation(...args),
}));
const mockExtractDealState = jest.fn();
jest.mock('@/lib/llm/deal', () => ({
  extractDealState: (...args: unknown[]) => mockExtractDealState(...args),
}));

import { NextRequest } from 'next/server';
import { POST, GET, PATCH } from '../conversations/[id]/summary/route';

function createParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const mockConversationData = {
  id: 'c1',
  userId: 'user-1',
  summary: null,
  messages: [
    { role: 'user', content: 'I want a raise' },
    { role: 'assistant', content: 'Why?' },
    { role: 'user', content: 'My performance was strong' },
  ],
  persona: {
    name: 'Alex',
    description: 'A manager',
    roleType: 'Manager',
    characteristics: null,
  },
  scenario: {
    title: 'Salary Negotiation',
    description: 'Negotiate a raise',
    userRole: 'Employee',
    aiRole: 'Manager',
    evaluationCriteria: '{}',
    issues: '[]',
  },
};

function createParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/conversations/[id]/summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await POST(request, createParams('c1'));
    expect(response.status).toBe(401);
  });

  it('returns 404 when conversation not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(null);
    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await POST(request, createParams('c1'));
    expect(response.status).toBe(404);
  });

  it('returns 403 when conversation belongs to another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-2',
      summary: null,
    });
    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await POST(request, createParams('c1'));
    expect(response.status).toBe(403);
  });

  it('returns existing summary if already generated', async () => {
    const existingSummary = { id: 'sum-1', overallScore: 7, conversationId: 'c1' };
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      summary: existingSummary,
    });
    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await POST(request, createParams('c1'));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.summary).toEqual(existingSummary);
    expect(mockSummary.create).not.toHaveBeenCalled();
  });

  it('calls evaluateConversation with messages, persona, and scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(mockConversationData);
    mockEvaluateConversation.mockResolvedValue({
      overallScore: 72,
      winningArguments: [{ text: 'Strong point', framework: 'Prep', element: 'Research', effectiveness: 4 }],
      llmFeedback: { whatWentWell: ['Good'], whatToImprove: ['More data'], specificSuggestions: ['Try X'] },
      frameworkScores: { Preparation: 75 },
    });
    mockSummary.create.mockResolvedValue({ id: 'sum-new' });
    mockConversation.update.mockResolvedValue({});

    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    await POST(request, createParams('c1'));

    expect(mockEvaluateConversation).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'I want a raise' }),
      ]),
      expect.objectContaining({ name: 'Alex' }),
      expect.objectContaining({ title: 'Salary Negotiation' }),
      undefined, // no deal outcome: the scenario has no issues
      expect.objectContaining({ userId: 'user-1', purpose: 'evaluation', conversationId: 'c1' })
    );
  });

  it('creates summary with real LLM evaluation scores', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(mockConversationData);
    mockEvaluateConversation.mockResolvedValue({
      overallScore: 72,
      winningArguments: [{ text: 'Strong point', framework: 'Prep', element: 'Research', effectiveness: 4 }],
      llmFeedback: { whatWentWell: ['Good'], whatToImprove: ['More data'], specificSuggestions: ['Try X'] },
      frameworkScores: { Preparation: 75 },
    });
    mockSummary.create.mockResolvedValue({ id: 'sum-new', overallScore: 72 });
    mockConversation.update.mockResolvedValue({});

    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await POST(request, createParams('c1'));

    expect(response.status).toBe(200);
    // Overall is the weighted mean of the matched framework scores (Preparation only here), not the model's 72.
    expect(mockSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overallScore: 75,
          winningArguments: expect.stringContaining('Strong point'),
          llmFeedback: expect.stringContaining('Good'),
          frameworkScores: expect.stringContaining('Preparation'),
        }),
      })
    );
  });

  it('falls back to null values when evaluation throws', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(mockConversationData);
    mockEvaluateConversation.mockRejectedValue(new Error('LLM down'));
    mockSummary.create.mockResolvedValue({ id: 'sum-new', overallScore: null });
    mockConversation.update.mockResolvedValue({});

    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await POST(request, createParams('c1'));

    expect(response.status).toBe(200);
    expect(mockSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overallScore: null,
        }),
      })
    );
  });

  it('stores "not scored" (null) when the evaluator returns no usable framework scores', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(mockConversationData);
    mockEvaluateConversation.mockResolvedValue({
      overallScore: 50,
      winningArguments: [],
      llmFeedback: { whatWentWell: ['Engaged'], whatToImprove: ['Evaluation could not be fully completed'], specificSuggestions: [] },
      frameworkScores: {},
    });
    mockSummary.create.mockResolvedValue({ id: 'sum-new', overallScore: null });
    mockConversation.update.mockResolvedValue({});

    await POST(new NextRequest('http://localhost:3000/api/conversations/c1/summary'), createParams('c1'));

    expect(mockSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ overallScore: null, frameworkScores: null, llmFeedback: null }) })
    );
  });

  it('computes and stores the deal outcome when the scenario has issues', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const issues = JSON.stringify([
      { name: 'Annual salary', unit: 'USD', learnerWants: 'higher', learner: { target: 130000, reservation: 115000, weight: 100 }, counterpart: { target: 108000, reservation: 120000, weight: 100 } },
    ]);
    mockConversation.findUnique.mockResolvedValue({ ...mockConversationData, scenario: { ...mockConversationData.scenario, issues } });
    mockExtractDealState.mockResolvedValue({ reached: true, terms: [{ issue: 'Annual salary', agreed: 118000, learnerLastAsk: 122000, counterpartLastOffer: 118000 }] });
    mockEvaluateConversation.mockResolvedValue({ overallScore: 0, winningArguments: [], llmFeedback: { whatWentWell: [], whatToImprove: [], specificSuggestions: [] }, frameworkScores: { Preparation: 60 } });
    mockSummary.create.mockResolvedValue({ id: 'sum-new' });
    mockConversation.update.mockResolvedValue({});

    await POST(new NextRequest('http://localhost:3000/api/conversations/c1/summary'), createParams('c1'));

    expect(mockExtractDealState).toHaveBeenCalledWith(expect.any(Array), expect.arrayContaining([expect.objectContaining({ name: 'Annual salary' })]), 'Alex', expect.objectContaining({ purpose: 'deal' }));
    const data = mockSummary.create.mock.calls[0][0].data;
    const deal = JSON.parse(data.deal);
    expect(deal.reached).toBe(true);
    expect(deal.issues[0].learnerCapture).toBe(20);
    // The evaluator receives the computed outcome so its feedback can cite the numbers.
    expect(mockEvaluateConversation).toHaveBeenCalledWith(expect.any(Array), expect.anything(), expect.anything(), expect.objectContaining({ reached: true }), expect.objectContaining({ purpose: 'evaluation' }));
  });

  it('skips deal extraction when the scenario has no issues', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(mockConversationData);
    mockEvaluateConversation.mockResolvedValue({ overallScore: 0, winningArguments: [], llmFeedback: { whatWentWell: [], whatToImprove: [], specificSuggestions: [] }, frameworkScores: { Preparation: 60 } });
    mockSummary.create.mockResolvedValue({ id: 'sum-new' });
    mockConversation.update.mockResolvedValue({});

    await POST(new NextRequest('http://localhost:3000/api/conversations/c1/summary'), createParams('c1'));

    expect(mockExtractDealState).not.toHaveBeenCalled();
    expect(mockSummary.create.mock.calls[0][0].data.deal).toBeNull();
  });

  it('marks conversation as completed after summary', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(mockConversationData);
    mockEvaluateConversation.mockResolvedValue({
      overallScore: 60,
      winningArguments: [],
      llmFeedback: { whatWentWell: [], whatToImprove: [], specificSuggestions: [] },
      frameworkScores: {},
    });
    mockSummary.create.mockResolvedValue({ id: 'sum-new' });
    mockConversation.update.mockResolvedValue({});

    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    await POST(request, createParams('c1'));

    expect(mockConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          status: 'completed',
        }),
      })
    );
  });
});

describe('GET /api/conversations/[id]/summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await GET(request, createParams('c1'));
    expect(response.status).toBe(401);
  });

  it('returns 404 when summary not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockSummary.findUnique.mockResolvedValue(null);
    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await GET(request, createParams('c1'));
    expect(response.status).toBe(404);
  });

  it('returns 403 when summary belongs to another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockSummary.findUnique.mockResolvedValue({
      id: 'sum-1',
      conversation: { userId: 'user-2' },
    });
    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await GET(request, createParams('c1'));
    expect(response.status).toBe(403);
  });

  it('returns summary for authorized user', async () => {
    const summary = {
      id: 'sum-1',
      overallScore: 8,
      conversation: { userId: 'user-1' },
    };
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockSummary.findUnique.mockResolvedValue(summary);

    const request = new NextRequest('http://localhost:3000/api/conversations/c1/summary');
    const response = await GET(request, createParams('c1'));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.summary).toEqual(summary);
  });
});

describe('PATCH /api/conversations/[id]/summary (felt real)', () => {
  beforeEach(() => jest.clearAllMocks());
  const req = (body: unknown) => new NextRequest('http://localhost:3000/api/conversations/c1/summary', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('rejects values outside 1-5', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    expect((await PATCH(req({ feltReal: 0 }), createParams('c1'))).status).toBe(400);
    expect((await PATCH(req({ feltReal: 'yes' }), createParams('c1'))).status).toBe(400);
  });

  it('a non-owner gets the same 404 as a missing summary (ownership is in the lookup)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'someone-else' } });
    mockSummary.findFirst.mockResolvedValue(null);
    expect((await PATCH(req({ feltReal: 4 }), createParams('c1'))).status).toBe(404);
    expect(mockSummary.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { conversationId: 'c1', conversation: { userId: 'someone-else' } } }));
    expect(mockSummary.update).not.toHaveBeenCalled();
  });

  it('stores the answer', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockSummary.findFirst.mockResolvedValue({ id: 's1' });
    mockSummary.update.mockResolvedValue({ id: 's1', feltReal: 4, feltRealNote: null });
    const res = await PATCH(req({ feltReal: 4 }), createParams('c1'));
    expect(res.status).toBe(200);
    expect(mockSummary.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' }, data: { feltReal: 4 } }));
  });
});
