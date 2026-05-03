/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/conversations/[id]/summary route.
 */

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

import { NextRequest } from 'next/server';
import { POST, GET } from '../conversations/[id]/summary/route';

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
      expect.objectContaining({ title: 'Salary Negotiation' })
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
    expect(mockSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overallScore: 72,
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
