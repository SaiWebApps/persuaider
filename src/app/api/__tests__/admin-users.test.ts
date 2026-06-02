/**
 * @jest-environment node
 */

const mockRequireAdmin = jest.fn();
jest.mock('@/lib/auth/admin', () => ({
  requireAdmin: () => mockRequireAdmin(),
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

const mockCreateUser = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({ users: { createUser: mockCreateUser } }),
}));

import { GET, POST } from '../admin/users/route';
import { NextResponse } from 'next/server';

describe('GET /api/admin/users', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('returns users for admin', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockUser.findMany.mockResolvedValue([
      { id: 'u1', email: 'admin@test.com', username: 'Admin', role: 'admin', createdAt: new Date() },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.users).toHaveLength(1);
  });
});

describe('POST /api/admin/users', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 for non-admin', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const request = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', username: 'Test' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('creates a Clerk user and returns a generated password', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockUser.findFirst.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({ id: 'clerk_new' });
    mockUser.create.mockResolvedValue({
      id: 'u2', email: 'new@test.com', username: 'New User', role: 'user', createdAt: new Date(),
    });

    const request = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@test.com', username: 'New User' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user.email).toBe('new@test.com');
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ emailAddress: ['new@test.com'], skipPasswordChecks: true })
    );
    expect(typeof data.generatedPassword).toBe('string');
    expect(data.generatedPassword.length).toBeGreaterThan(6);
  });

  it('returns 409 for duplicate email', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockUser.findFirst.mockResolvedValue({ id: 'existing', email: 'dup@test.com' });

    const request = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dup@test.com', username: 'Dup' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(409);
  });

  it('returns 400 when email is missing', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const request = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'No Email' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
