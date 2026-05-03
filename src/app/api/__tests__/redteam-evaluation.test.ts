/**
 * @jest-environment node
 */

/**
 * Red-team tests for evaluation and summary generation:
 * - Conversation with no user messages
 * - LLM returning out-of-range scores
 * - LLM returning non-JSON garbage
 * - Summary called twice (idempotency)
 * - End negotiation with 0 user messages
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

function summaryReq() {
  return new NextRequest('http://localhost:3000/api/conversations/c1/summary');
}

// =============================================================================
// SUMMARY ON CONVERSATION WITH 0 USER MESSAGES
// =============================================================================

describe('Summary - No User Messages (End Negotiation Immediately)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('handles evaluation where all messages are from assistant only', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      summary: null,
      messages: [
        { role: 'assistant', content: 'Hello, how can I help?' },
        { role: 'assistant', content: 'Are you there?' },
      ],
      persona: { name: 'Alex', description: 'Manager', roleType: 'Manager', characteristics: null },
      scenario: {
        title: 'Salary',
        description: 'Negotiate',
        userRole: 'Employee',
        aiRole: 'Manager',
        evaluationCriteria: '{}',
      },
    });

    // evaluateConversation should return the "empty" fallback internally
    // when there are no user messages
    mockEvaluateConversation.mockResolvedValue({
      overallScore: 0,
      winningArguments: [],
      llmFeedback: {
        whatWentWell: [],
        whatToImprove: ['No conversation to evaluate'],
        specificSuggestions: ['Try exchanging a few messages before ending the negotiation'],
      },
      frameworkScores: {},
    });

    mockSummary.create.mockResolvedValue({
      id: 'sum-empty',
      overallScore: 0,
      conversationId: 'c1',
    });
    mockConversation.update.mockResolvedValue({});

    const res = await POST(summaryReq(), createParams('c1'));
    expect(res.status).toBe(200);

    // Should still create a summary record (with score 0)
    expect(mockSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overallScore: 0,
        }),
      })
    );
  });

  it('handles conversation with exactly 0 messages', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      summary: null,
      messages: [],
      persona: { name: 'Alex', description: 'Manager', roleType: 'Manager', characteristics: null },
      scenario: {
        title: 'Salary',
        description: 'Negotiate',
        userRole: 'Employee',
        aiRole: 'Manager',
        evaluationCriteria: '{}',
      },
    });

    mockEvaluateConversation.mockResolvedValue({
      overallScore: 0,
      winningArguments: [],
      llmFeedback: {
        whatWentWell: [],
        whatToImprove: ['No conversation to evaluate'],
        specificSuggestions: ['Try exchanging a few messages before ending the negotiation'],
      },
      frameworkScores: {},
    });

    mockSummary.create.mockResolvedValue({ id: 'sum-empty', overallScore: 0 });
    mockConversation.update.mockResolvedValue({});

    const res = await POST(summaryReq(), createParams('c1'));
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// SUMMARY CALLED TWICE (IDEMPOTENCY)
// =============================================================================

describe('Summary - Idempotency (Called Twice)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns existing summary without re-evaluating when called twice', async () => {
    const existingSummary = {
      id: 'sum-existing',
      overallScore: 72,
      conversationId: 'c1',
      winningArguments: '[]',
      llmFeedback: '{}',
      frameworkScores: '{}',
    };

    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      summary: existingSummary,
      messages: [{ role: 'user', content: 'hi' }],
      persona: { name: 'Alex', description: 'D', roleType: 'R', characteristics: null },
      scenario: { title: 'T', description: 'D', userRole: 'U', aiRole: 'A', evaluationCriteria: '{}' },
    });

    const res = await POST(summaryReq(), createParams('c1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toEqual(existingSummary);

    // Should NOT call evaluation or create a new summary
    expect(mockEvaluateConversation).not.toHaveBeenCalled();
    expect(mockSummary.create).not.toHaveBeenCalled();
    expect(mockConversation.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// EVALUATION RETURNS OUT-OF-RANGE SCORES
// =============================================================================

describe('Summary - Out-of-Range Evaluation Scores', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('handles evaluation returning overallScore above 100 (clamped by evaluateConversation)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      summary: null,
      messages: [
        { role: 'user', content: 'Give me a raise' },
        { role: 'assistant', content: 'Why?' },
      ],
      persona: { name: 'Alex', description: 'D', roleType: 'R', characteristics: null },
      scenario: { title: 'T', description: 'D', userRole: 'U', aiRole: 'A', evaluationCriteria: '{}' },
    });

    // Simulate evaluation returning clamped score (the evaluation module clamps internally)
    mockEvaluateConversation.mockResolvedValue({
      overallScore: 100, // clamped from 150
      winningArguments: [],
      llmFeedback: { whatWentWell: ['Perfect'], whatToImprove: [], specificSuggestions: [] },
      frameworkScores: { Preparation: 100 },
    });

    mockSummary.create.mockResolvedValue({ id: 'sum-1', overallScore: 100 });
    mockConversation.update.mockResolvedValue({});

    const res = await POST(summaryReq(), createParams('c1'));
    expect(res.status).toBe(200);
    expect(mockSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ overallScore: 100 }),
      })
    );
  });

  it('handles evaluation returning overallScore of 0 (clamped from negative)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      summary: null,
      messages: [
        { role: 'user', content: 'Whatever' },
        { role: 'assistant', content: 'Hmm' },
      ],
      persona: { name: 'Alex', description: 'D', roleType: 'R', characteristics: null },
      scenario: { title: 'T', description: 'D', userRole: 'U', aiRole: 'A', evaluationCriteria: '{}' },
    });

    mockEvaluateConversation.mockResolvedValue({
      overallScore: 0, // clamped from -10
      winningArguments: [],
      llmFeedback: { whatWentWell: [], whatToImprove: ['Terrible'], specificSuggestions: ['Start over'] },
      frameworkScores: {},
    });

    mockSummary.create.mockResolvedValue({ id: 'sum-1', overallScore: 0 });
    mockConversation.update.mockResolvedValue({});

    const res = await POST(summaryReq(), createParams('c1'));
    expect(res.status).toBe(200);
    expect(mockSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ overallScore: 0 }),
      })
    );
  });
});

// =============================================================================
// EVALUATION RETURNS NON-JSON / GARBAGE
// =============================================================================

describe('Summary - Evaluation Failure Modes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('handles evaluateConversation throwing an error (LLM down)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      summary: null,
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
      persona: { name: 'Alex', description: 'D', roleType: 'R', characteristics: null },
      scenario: { title: 'T', description: 'D', userRole: 'U', aiRole: 'A', evaluationCriteria: '{}' },
    });

    mockEvaluateConversation.mockRejectedValue(new Error('LLM service unavailable'));

    mockSummary.create.mockResolvedValue({ id: 'sum-1', overallScore: null });
    mockConversation.update.mockResolvedValue({});

    const res = await POST(summaryReq(), createParams('c1'));
    // Should still succeed with null scores
    expect(res.status).toBe(200);
    expect(mockSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overallScore: null,
          winningArguments: '[]',
          llmFeedback: null,
          frameworkScores: null,
        }),
      })
    );
  });

  it('still marks conversation as completed even when evaluation fails', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      summary: null,
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
      persona: { name: 'Alex', description: 'D', roleType: 'R', characteristics: null },
      scenario: { title: 'T', description: 'D', userRole: 'U', aiRole: 'A', evaluationCriteria: '{}' },
    });

    mockEvaluateConversation.mockRejectedValue(new Error('timeout'));
    mockSummary.create.mockResolvedValue({ id: 'sum-1', overallScore: null });
    mockConversation.update.mockResolvedValue({});

    await POST(summaryReq(), createParams('c1'));

    expect(mockConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ status: 'completed' }),
      })
    );
  });
});

// =============================================================================
// GET SUMMARY - AUTH
// =============================================================================

describe('GET Summary - Auth Boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 403 when trying to GET another user summary', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'attacker' } });
    mockSummary.findUnique.mockResolvedValue({
      id: 'sum-1',
      overallScore: 85,
      conversation: { userId: 'victim' },
    });

    const res = await GET(summaryReq(), createParams('c1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when summary does not exist', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockSummary.findUnique.mockResolvedValue(null);

    const res = await GET(summaryReq(), createParams('c1'));
    expect(res.status).toBe(404);
  });
});
