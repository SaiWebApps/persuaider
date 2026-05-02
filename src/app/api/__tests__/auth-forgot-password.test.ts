/**
 * @jest-environment node
 */

const mockUser = {
  findUnique: jest.fn(),
};

const mockToken = {
  create: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: mockUser, passwordResetToken: mockToken };
  },
}));

const mockSendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/email', () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('mock-random-token-hex'),
  }),
}));

import { POST } from '../auth/forgot-password/route';

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  it('returns 200 and sends email for existing user', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 'u1', email: 'user@test.com' });
    mockToken.create.mockResolvedValue({ id: 't1' });

    const res = await POST(req({ email: 'user@test.com' }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message).toBe('If an account exists with that email, a reset link has been sent.');

    expect(mockToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          token: 'mock-random-token-hex',
          userId: 'u1',
        }),
      })
    );
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      'user@test.com',
      'http://localhost:3000/reset-password?token=mock-random-token-hex'
    );
  });

  it('returns 200 for non-existent email without creating token or sending email', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const res = await POST(req({ email: 'nouser@test.com' }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message).toBe('If an account exists with that email, a reset link has been sent.');

    expect(mockToken.create).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('returns 400 for missing email', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Email is required');
  });

  it('returns 400 for empty email', async () => {
    const res = await POST(req({ email: '   ' }));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Email is required');
  });

  it('creates token with 1-hour expiry', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    mockUser.findUnique.mockResolvedValue({ id: 'u1', email: 'user@test.com' });
    mockToken.create.mockResolvedValue({ id: 't1' });

    await POST(req({ email: 'user@test.com' }));

    const createCall = mockToken.create.mock.calls[0][0];
    const expiresAt = createCall.data.expiresAt;
    expect(expiresAt.getTime()).toBe(now + 60 * 60 * 1000);

    jest.restoreAllMocks();
  });

  it('uses crypto.randomBytes for token generation', async () => {
    const crypto = require('crypto');
    mockUser.findUnique.mockResolvedValue({ id: 'u1', email: 'user@test.com' });
    mockToken.create.mockResolvedValue({ id: 't1' });

    await POST(req({ email: 'user@test.com' }));

    expect(crypto.randomBytes).toHaveBeenCalledWith(32);
  });
});
