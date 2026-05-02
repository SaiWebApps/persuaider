/**
 * @jest-environment node
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
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

jest.mock('generate-password', () => ({
  generate: jest.fn().mockReturnValue('Gen3r@tedP4ss'),
}));

import { GET, POST } from '../admin/users/route';

describe('GET /api/admin/users', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('returns users for admin', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
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
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const request = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@test.com', username: 'Test' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('creates user with generated password', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockUser.findFirst.mockResolvedValue(null);
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
    expect(data.generatedPassword).toBe('Gen3r@tedP4ss');
    expect(data.user.email).toBe('new@test.com');
  });

  it('returns 409 for duplicate email', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
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
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    const request = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'No Email' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
