/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockUserDb = {
  findUnique: jest.fn(),
  update: jest.fn(),
};
const mockConversation = {
  count: jest.fn(),
};
const mockSummary = {
  findMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      user: mockUserDb,
      conversation: mockConversation,
      summary: mockSummary,
    };
  },
}));

import { GET, PATCH } from '../user/profile/route';

function createPatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/user/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/user/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 without auth', async () => {
    mockAuthFn.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns 403 when email not verified', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserDb.findUnique.mockResolvedValueOnce({ emailVerified: null });
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('returns 200 with correct stats shape', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserDb.findUnique
      .mockResolvedValueOnce({ emailVerified: new Date() })
      .mockResolvedValueOnce({ username: 'testuser', email: 'test@example.com' });
    mockConversation.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);
    mockSummary.findMany.mockResolvedValue([
      { overallScore: 80 },
      { overallScore: 90 },
      { overallScore: 70 },
    ]);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.username).toBe('testuser');
    expect(data.email).toBe('test@example.com');
    expect(data.stats.totalConversations).toBe(5);
    expect(data.stats.completedConversations).toBe(3);
    expect(data.stats.averageScore).toBe(80);
    expect(data.stats.completionRate).toBe(60);
  });

  it('returns 0 values when user has no conversations', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserDb.findUnique
      .mockResolvedValueOnce({ emailVerified: new Date() })
      .mockResolvedValueOnce({ username: 'newuser', email: 'new@example.com' });
    mockConversation.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockSummary.findMany.mockResolvedValue([]);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stats.totalConversations).toBe(0);
    expect(data.stats.completedConversations).toBe(0);
    expect(data.stats.averageScore).toBe(0);
    expect(data.stats.completionRate).toBe(0);
  });
});

describe('PATCH /api/user/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 401 without auth', async () => {
    mockAuthFn.mockResolvedValue(null);
    const response = await PATCH(createPatchRequest({ username: 'test' }));
    expect(response.status).toBe(401);
  });

  it('returns 400 when username is empty', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const response = await PATCH(createPatchRequest({ username: '' }));
    expect(response.status).toBe(400);
  });

  it('returns 400 when username is less than 3 characters', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const response = await PATCH(createPatchRequest({ username: 'ab' }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('at least 3');
  });

  it('returns 400 when username exceeds 50 characters', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const longName = 'a'.repeat(51);
    const response = await PATCH(createPatchRequest({ username: longName }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('at most 50');
  });

  it('returns 409 when username already taken by another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserDb.findUnique
      .mockResolvedValueOnce({ emailVerified: new Date() })
      .mockResolvedValueOnce({ id: 'user-2' });
    const response = await PATCH(createPatchRequest({ username: 'taken' }));
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toBe('Username already taken');
  });

  it('returns 400 when username contains XSS attempt', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const response = await PATCH(createPatchRequest({ username: '<script>alert(1)</script>' }));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Username contains invalid characters');
  });

  it('silently ignores role field in body', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserDb.findUnique
      .mockResolvedValueOnce({ emailVerified: new Date() })
      .mockResolvedValueOnce(null);
    mockUserDb.update.mockResolvedValue({
      username: 'validname',
      email: 'user@example.com',
      role: 'user',
    });

    const response = await PATCH(createPatchRequest({ username: 'validname', role: 'admin' }));
    expect(response.status).toBe(200);
    expect(mockUserDb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { username: 'validname' },
      })
    );
  });

  it('returns 200 with updated username on valid request', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserDb.findUnique
      .mockResolvedValueOnce({ emailVerified: new Date() })
      .mockResolvedValueOnce(null);
    mockUserDb.update.mockResolvedValue({
      username: 'newname',
      email: 'user@example.com',
      role: 'user',
    });

    const response = await PATCH(createPatchRequest({ username: 'newname' }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.username).toBe('newname');
    expect(data.email).toBe('user@example.com');
  });

  it('allows unicode emoji in username', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserDb.findUnique
      .mockResolvedValueOnce({ emailVerified: new Date() })
      .mockResolvedValueOnce(null);
    mockUserDb.update.mockResolvedValue({
      username: 'user✨star',
      email: 'user@example.com',
      role: 'user',
    });

    const response = await PATCH(createPatchRequest({ username: 'user✨star' }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.username).toBe('user✨star');
  });

  it('allows same user to keep their current username', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserDb.findUnique
      .mockResolvedValueOnce({ emailVerified: new Date() })
      .mockResolvedValueOnce({ id: 'user-1' });
    mockUserDb.update.mockResolvedValue({
      username: 'myname',
      email: 'user@example.com',
      role: 'user',
    });

    const response = await PATCH(createPatchRequest({ username: 'myname' }));
    expect(response.status).toBe(200);
  });
});
