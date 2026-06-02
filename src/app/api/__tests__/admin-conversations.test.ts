/**
 * @jest-environment node
 */

const mockClerkAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
  currentUser: jest.fn(),
}));

const mockUserFindUnique = jest.fn();
const mockConversation = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      conversation: mockConversation,
      user: { findUnique: mockUserFindUnique },
    };
  },
}));

import { GET as listGET } from '../admin/conversations/route';
import { GET as detailGET } from '../admin/conversations/[id]/route';

function mockAdmin() {
  mockClerkAuth.mockResolvedValue({ userId: 'clerk-1', sessionClaims: { metadata: { role: 'admin' } } });
  mockUserFindUnique.mockResolvedValue({ id: 'u1', role: 'admin' });
}

function mockNonAdmin() {
  mockClerkAuth.mockResolvedValue({ userId: 'clerk-1', sessionClaims: { metadata: { role: 'user' } } });
  mockUserFindUnique.mockResolvedValue({ id: 'u1', role: 'user' });
}

function mockNoAuth() {
  mockClerkAuth.mockResolvedValue({ userId: null, sessionClaims: null });
}

describe('GET /api/admin/conversations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockNoAuth();
    const req = new Request('http://localhost/api/admin/conversations');
    const response = await listGET(req);
    expect(response.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockNonAdmin();
    const req = new Request('http://localhost/api/admin/conversations');
    const response = await listGET(req);
    expect(response.status).toBe(403);
  });

  it('returns paginated conversations with defaults', async () => {
    mockAdmin();
    mockConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        userId: 'u1',
        status: 'completed',
        startedAt: new Date('2026-01-01'),
        completedAt: new Date('2026-01-02'),
        user: { username: 'Alice' },
        persona: { name: 'Tough Boss' },
        scenario: { title: 'Salary Negotiation' },
        _count: { messages: 10 },
        summary: { overallScore: 85 },
      },
    ]);
    mockConversation.count.mockResolvedValue(1);

    const req = new Request('http://localhost/api/admin/conversations');
    const response = await listGET(req);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversations).toHaveLength(1);
    expect(data.conversations[0].username).toBe('Alice');
    expect(data.conversations[0].messageCount).toBe(10);
    expect(data.conversations[0].score).toBe(85);
    expect(data.page).toBe(1);
    expect(data.total).toBe(1);
    expect(data.totalPages).toBe(1);
  });

  it('respects custom page and limit', async () => {
    mockAdmin();
    mockConversation.findMany.mockResolvedValue([]);
    mockConversation.count.mockResolvedValue(50);

    const req = new Request('http://localhost/api/admin/conversations?page=3&limit=10');
    const response = await listGET(req);
    const data = await response.json();
    expect(data.page).toBe(3);
    expect(data.totalPages).toBe(5);
    expect(mockConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 10,
    }));
  });

  it('returns 400 for page=0', async () => {
    mockAdmin();
    const req = new Request('http://localhost/api/admin/conversations?page=0');
    const response = await listGET(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 for negative page', async () => {
    mockAdmin();
    const req = new Request('http://localhost/api/admin/conversations?page=-1');
    const response = await listGET(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 for limit=0', async () => {
    mockAdmin();
    const req = new Request('http://localhost/api/admin/conversations?limit=0');
    const response = await listGET(req);
    expect(response.status).toBe(400);
  });

  it('returns 400 for negative limit', async () => {
    mockAdmin();
    const req = new Request('http://localhost/api/admin/conversations?limit=-5');
    const response = await listGET(req);
    expect(response.status).toBe(400);
  });

  it('caps limit at 100', async () => {
    mockAdmin();
    mockConversation.findMany.mockResolvedValue([]);
    mockConversation.count.mockResolvedValue(0);

    const req = new Request('http://localhost/api/admin/conversations?limit=500');
    const response = await listGET(req);
    expect(response.status).toBe(200);
    expect(mockConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 100,
    }));
  });

  it('filters by status', async () => {
    mockAdmin();
    mockConversation.findMany.mockResolvedValue([]);
    mockConversation.count.mockResolvedValue(0);

    const req = new Request('http://localhost/api/admin/conversations?status=completed');
    await listGET(req);
    expect(mockConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'completed' },
    }));
  });

  it('filters by userId', async () => {
    mockAdmin();
    mockConversation.findMany.mockResolvedValue([]);
    mockConversation.count.mockResolvedValue(0);

    const req = new Request('http://localhost/api/admin/conversations?userId=u2');
    await listGET(req);
    expect(mockConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u2' },
    }));
  });

  it('handles conversation with null score', async () => {
    mockAdmin();
    mockConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        userId: 'u1',
        status: 'in_progress',
        startedAt: new Date('2026-01-01'),
        completedAt: null,
        user: { username: 'Alice' },
        persona: { name: 'Boss' },
        scenario: { title: 'Test' },
        _count: { messages: 3 },
        summary: null,
      },
    ]);
    mockConversation.count.mockResolvedValue(1);

    const req = new Request('http://localhost/api/admin/conversations');
    const response = await listGET(req);
    const data = await response.json();
    expect(data.conversations[0].score).toBeNull();
  });

  it('handles empty conversation list', async () => {
    mockAdmin();
    mockConversation.findMany.mockResolvedValue([]);
    mockConversation.count.mockResolvedValue(0);

    const req = new Request('http://localhost/api/admin/conversations');
    const response = await listGET(req);
    const data = await response.json();
    expect(data.conversations).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.totalPages).toBe(0);
  });
});

describe('GET /api/admin/conversations/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockNoAuth();
    const req = new Request('http://localhost/api/admin/conversations/c1');
    const response = await detailGET(req, { params: Promise.resolve({ id: 'c1' }) });
    expect(response.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockNonAdmin();
    const req = new Request('http://localhost/api/admin/conversations/c1');
    const response = await detailGET(req, { params: Promise.resolve({ id: 'c1' }) });
    expect(response.status).toBe(403);
  });

  it('returns 404 for non-existent conversation', async () => {
    mockAdmin();
    mockConversation.findUnique.mockResolvedValue(null);
    const req = new Request('http://localhost/api/admin/conversations/nonexist');
    const response = await detailGET(req, { params: Promise.resolve({ id: 'nonexist' }) });
    expect(response.status).toBe(404);
  });

  it('returns full conversation with messages', async () => {
    mockAdmin();
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'completed',
      startedAt: new Date('2026-01-01'),
      completedAt: new Date('2026-01-02'),
      user: { username: 'Alice', email: 'alice@test.com' },
      persona: { name: 'Tough Boss', roleType: 'antagonist' },
      scenario: { title: 'Salary Negotiation' },
      messages: [
        { role: 'assistant', content: 'Hello', mood: 'neutral', createdAt: new Date('2026-01-01T10:00:00Z') },
        { role: 'user', content: 'Hi there', mood: null, createdAt: new Date('2026-01-01T10:01:00Z') },
      ],
      summary: {
        overallScore: 85,
        winningArguments: "[]",
        llmFeedback: "{}",
        frameworkScores: null,
      },
    });

    const req = new Request('http://localhost/api/admin/conversations/c1');
    const response = await detailGET(req, { params: Promise.resolve({ id: 'c1' }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversation.user.username).toBe('Alice');
    expect(data.conversation.persona.name).toBe('Tough Boss');
    expect(data.conversation.messages).toHaveLength(2);
    expect(data.conversation.summary.overallScore).toBe(85);
  });

  it('returns conversation with empty messages array', async () => {
    mockAdmin();
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'in_progress',
      startedAt: new Date('2026-01-01'),
      completedAt: null,
      user: { username: 'Alice', email: 'alice@test.com' },
      persona: { name: 'Boss', roleType: 'antagonist' },
      scenario: { title: 'Test' },
      messages: [],
      summary: null,
    });

    const req = new Request('http://localhost/api/admin/conversations/c1');
    const response = await detailGET(req, { params: Promise.resolve({ id: 'c1' }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversation.messages).toHaveLength(0);
    expect(data.conversation.summary).toBeNull();
  });

  it('returns conversation with null summary score', async () => {
    mockAdmin();
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'completed',
      startedAt: new Date('2026-01-01'),
      completedAt: new Date('2026-01-02'),
      user: { username: 'Bob', email: 'bob@test.com' },
      persona: { name: 'Colleague', roleType: 'peer' },
      scenario: { title: 'Negotiation' },
      messages: [
        { role: 'user', content: 'test', mood: null, createdAt: new Date() },
      ],
      summary: {
        overallScore: null,
        winningArguments: "[]",
        llmFeedback: null,
        frameworkScores: null,
      },
    });

    const req = new Request('http://localhost/api/admin/conversations/c1');
    const response = await detailGET(req, { params: Promise.resolve({ id: 'c1' }) });
    const data = await response.json();
    expect(data.conversation.summary.overallScore).toBeNull();
  });
});