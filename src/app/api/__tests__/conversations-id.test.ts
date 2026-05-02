/**
 * @jest-environment node
 */

/**
 * Tests for /api/conversations/[id] routes (GET, PATCH, DELETE).
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockConversation = {
  findUnique: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { conversation: mockConversation };
  },
}));

import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from '../conversations/[id]/route';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// GET /api/conversations/[id]
// ---------------------------------------------------------------------------
describe('GET /api/conversations/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/conversations/c1');
    const res = await GET(req, createParams('c1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when conversation not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/conversations/nonexistent');
    const res = await GET(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  it('returns 403 when conversation belongs to another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-2',
      persona: {},
      scenario: {},
      messages: [],
      summary: null,
    });
    const req = new NextRequest('http://localhost/api/conversations/c1');
    const res = await GET(req, createParams('c1'));
    expect(res.status).toBe(403);
  });

  it('returns conversation details for the owner', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const convData = {
      id: 'c1',
      userId: 'user-1',
      persona: { id: 'p1', name: 'Alex', description: 'Manager', roleType: 'Manager', characteristics: null },
      scenario: { id: 's1', title: 'Salary', userRole: 'Employee', aiRole: 'Manager' },
      messages: [
        { id: 'm1', role: 'assistant', content: 'Hello', createdAt: new Date() },
        { id: 'm2', role: 'user', content: 'Hi', createdAt: new Date() },
      ],
      summary: null,
    };
    mockConversation.findUnique.mockResolvedValue(convData);
    const req = new NextRequest('http://localhost/api/conversations/c1');
    const res = await GET(req, createParams('c1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation.id).toBe('c1');
    expect(data.conversation.messages).toHaveLength(2);
    expect(data.conversation.persona.name).toBe('Alex');
  });

  it('includes summary when it exists', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'c1',
      userId: 'user-1',
      persona: {},
      scenario: {},
      messages: [],
      summary: { id: 'sum-1', overallScore: 85 },
    });
    const req = new NextRequest('http://localhost/api/conversations/c1');
    const res = await GET(req, createParams('c1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation.summary.overallScore).toBe(85);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/conversations/[id]
// ---------------------------------------------------------------------------
describe('PATCH /api/conversations/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/conversations/c1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const res = await PATCH(req, createParams('c1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when conversation not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/conversations/c1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const res = await PATCH(req, createParams('c1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when conversation belongs to another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-2' });
    const req = new NextRequest('http://localhost/api/conversations/c1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const res = await PATCH(req, createParams('c1'));
    expect(res.status).toBe(403);
  });

  it('updates conversation status', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-1' });
    mockConversation.update.mockResolvedValue({ id: 'c1', status: 'completed', completedAt: new Date() });
    const req = new NextRequest('http://localhost/api/conversations/c1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const res = await PATCH(req, createParams('c1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation.status).toBe('completed');
  });

  it('sets completedAt when status changes to "completed"', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-1' });
    mockConversation.update.mockResolvedValue({ id: 'c1', status: 'completed' });
    const req = new NextRequest('http://localhost/api/conversations/c1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    await PATCH(req, createParams('c1'));
    expect(mockConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          completedAt: expect.any(Date),
        }),
      })
    );
  });

  it('does not set completedAt for non-completed status', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-1' });
    mockConversation.update.mockResolvedValue({ id: 'c1', status: 'abandoned' });
    const req = new NextRequest('http://localhost/api/conversations/c1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'abandoned' }),
    });
    await PATCH(req, createParams('c1'));
    const callData = mockConversation.update.mock.calls[0][0].data;
    expect(callData.status).toBe('abandoned');
    expect(callData.completedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/conversations/[id]
// ---------------------------------------------------------------------------
describe('DELETE /api/conversations/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/conversations/c1', { method: 'DELETE' });
    const res = await DELETE(req, createParams('c1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when conversation not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/conversations/c1', { method: 'DELETE' });
    const res = await DELETE(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when conversation belongs to another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-2' });
    const req = new NextRequest('http://localhost/api/conversations/c1', { method: 'DELETE' });
    const res = await DELETE(req, createParams('c1'));
    expect(res.status).toBe(403);
  });

  it('deletes conversation and returns success', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({ id: 'c1', userId: 'user-1' });
    mockConversation.delete.mockResolvedValue({});
    const req = new NextRequest('http://localhost/api/conversations/c1', { method: 'DELETE' });
    const res = await DELETE(req, createParams('c1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockConversation.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });
});
