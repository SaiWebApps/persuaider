/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/admin/users/[id] routes (GET, PATCH, DELETE).
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockUser = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: mockUser };
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-new-password'),
}));

jest.mock('generate-password', () => ({
  generate: jest.fn().mockReturnValue('N3wP@ssw0rd!'),
}));

import { GET, PATCH, DELETE } from '../admin/users/[id]/route';
import { NextRequest } from 'next/server';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest('http://localhost/api/admin/users/u1', {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/users/[id]
// ---------------------------------------------------------------------------
describe('GET /api/admin/users/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest('GET');
    const res = await GET(req, createParams('u1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = createRequest('GET');
    const res = await GET(req, createParams('u1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUser.findUnique.mockResolvedValue(null);
    const req = createRequest('GET');
    const res = await GET(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  it('returns user with counts for admin', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    const userRecord = {
      id: 'u1',
      email: 'user@test.com',
      username: 'TestUser',
      role: 'user',
      createdAt: new Date().toISOString(),
      _count: { conversations: 3, scenarioMemberships: 2 },
    };
    mockUser.findUnique.mockResolvedValue(userRecord);

    const req = createRequest('GET');
    const res = await GET(req, createParams('u1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.id).toBe('u1');
    expect(data.user._count.conversations).toBe(3);
    expect(data.user._count.scenarioMemberships).toBe(2);
  });

  it('passes correct id to prisma', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUser.findUnique.mockResolvedValue({ id: 'target-id' });

    const req = createRequest('GET');
    await GET(req, createParams('target-id'));
    expect(mockUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'target-id' } })
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/[id]
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/users/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest('PATCH', { role: 'admin' });
    const res = await PATCH(req, createParams('u1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = createRequest('PATCH', { role: 'admin' });
    const res = await PATCH(req, createParams('u1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when no valid fields provided', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    const req = createRequest('PATCH', { bogus: 'value' });
    const res = await PATCH(req, createParams('u1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no valid/i);
  });

  it('updates user role', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    const updated = {
      id: 'u1',
      email: 'user@test.com',
      username: 'User',
      role: 'admin',
    };
    mockUser.update.mockResolvedValue(updated);

    const req = createRequest('PATCH', { role: 'admin' });
    const res = await PATCH(req, createParams('u1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.role).toBe('admin');
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { role: 'admin' },
      })
    );
  });

  it('ignores invalid role values', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    const req = createRequest('PATCH', { role: 'superuser' });
    const res = await PATCH(req, createParams('u1'));
    // 'superuser' is not in ['user','admin'], so no valid fields
    expect(res.status).toBe(400);
  });

  it('resets password and returns generated password', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    const updated = {
      id: 'u1',
      email: 'user@test.com',
      username: 'User',
      role: 'user',
    };
    mockUser.update.mockResolvedValue(updated);

    const req = createRequest('PATCH', { resetPassword: true });
    const res = await PATCH(req, createParams('u1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.generatedPassword).toBe('N3wP@ssw0rd!');
    expect(data.user.id).toBe('u1');
  });

  it('resets password AND updates role in one call', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    const updated = {
      id: 'u1',
      email: 'user@test.com',
      username: 'User',
      role: 'admin',
    };
    mockUser.update.mockResolvedValue(updated);

    const req = createRequest('PATCH', { resetPassword: true, role: 'admin' });
    const res = await PATCH(req, createParams('u1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.generatedPassword).toBe('N3wP@ssw0rd!');
    expect(data.user.role).toBe('admin');
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'admin',
          passwordHash: 'hashed-new-password',
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/[id]
// ---------------------------------------------------------------------------
describe('DELETE /api/admin/users/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest('DELETE');
    const res = await DELETE(req, createParams('u1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = createRequest('DELETE');
    const res = await DELETE(req, createParams('u1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUser.findUnique.mockResolvedValue(null);
    const req = createRequest('DELETE');
    const res = await DELETE(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  it('deletes user and returns success', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUser.findUnique.mockResolvedValue({ id: 'u1' });
    mockUser.delete.mockResolvedValue({ id: 'u1' });

    const req = createRequest('DELETE');
    const res = await DELETE(req, createParams('u1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockUser.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });
});
