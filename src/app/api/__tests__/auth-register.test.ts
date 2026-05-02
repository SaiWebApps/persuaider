/**
 * @jest-environment node
 */

const mockUser = {
  findUnique: jest.fn(),
  create: jest.fn(),
};

const mockEmailVerificationToken = {
  create: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: mockUser, emailVerificationToken: mockEmailVerificationToken };
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-pw'),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('mock-verification-token'),
  }),
}));

const mockSendVerification = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/email/verification', () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSendVerification(...args),
}));

import { POST } from '../auth/register/route';

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const valid = { email: 'new@test.com', username: 'newuser', password: 'password1', confirmPassword: 'password1' };

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    mockEmailVerificationToken.create.mockResolvedValue({ id: 't1' });
  });

  it('returns 201 on happy path', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: 'u1', email: 'new@test.com', username: 'newuser' });
    const res = await POST(req(valid));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user.email).toBe('new@test.com');
  });

  it('returns 400 for missing email', async () => {
    const res = await POST(req({ ...valid, email: '' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.email).toBeDefined();
  });

  it('returns 400 for invalid email', async () => {
    const res = await POST(req({ ...valid, email: 'notanemail' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const res = await POST(req({ ...valid, password: '123', confirmPassword: '123' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.password).toBeDefined();
  });

  it('returns 400 for mismatched passwords', async () => {
    const res = await POST(req({ ...valid, confirmPassword: 'different' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.confirmPassword).toBeDefined();
  });

  it('returns 400 for short username', async () => {
    const res = await POST(req({ ...valid, username: 'ab' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate email', async () => {
    mockUser.findUnique.mockImplementation(({ where }: { where: { email?: string } }) => {
      if (where.email) return { id: 'existing' };
      return null;
    });
    const res = await POST(req(valid));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.errors.email).toContain('already');
  });

  it('returns 409 for duplicate username', async () => {
    mockUser.findUnique.mockImplementation(({ where }: { where: { email?: string; username?: string } }) => {
      if (where.email) return null;
      if (where.username) return { id: 'existing' };
      return null;
    });
    const res = await POST(req(valid));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.errors.username).toContain('already');
  });

  it('creates user with hashed password and role user', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: 'u1', email: 'new@test.com', username: 'newuser' });
    await POST(req(valid));
    expect(mockUser.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        passwordHash: 'hashed-pw',
        role: 'user',
        provider: 'credentials',
      }),
    }));
  });
});
