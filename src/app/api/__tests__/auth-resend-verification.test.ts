/**
 * @jest-environment node
 */

const mockUser = {
  findUnique: jest.fn(),
};

const mockToken = {
  create: jest.fn(),
  deleteMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: mockUser, emailVerificationToken: mockToken };
  },
}));

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockSendVerification = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/email/verification', () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSendVerification(...args),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('mock-verification-token'),
  }),
}));

import { POST } from '../auth/resend-verification/route';

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    mockAuthFn.mockResolvedValue({ user: {} });
    const res = await POST();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when already verified', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      emailVerified: new Date(),
    });

    const res = await POST();
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Email already verified');
  });

  it('returns 200 and sends email for unverified user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      emailVerified: null,
    });
    mockToken.deleteMany.mockResolvedValue({});
    mockToken.create.mockResolvedValue({ id: 't1' });

    const res = await POST();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe('Verification email sent');

    expect(mockSendVerification).toHaveBeenCalledWith(
      'user@test.com',
      'http://localhost:3000/verify-email?token=mock-verification-token'
    );
  });

  it('deletes old tokens before creating new one', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      emailVerified: null,
    });
    mockToken.deleteMany.mockResolvedValue({});
    mockToken.create.mockResolvedValue({ id: 't1' });

    await POST();

    // deleteMany should be called before create
    const deleteManyOrder = mockToken.deleteMany.mock.invocationCallOrder[0];
    const createOrder = mockToken.create.mock.invocationCallOrder[0];
    expect(deleteManyOrder).toBeLessThan(createOrder);

    expect(mockToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });
});
