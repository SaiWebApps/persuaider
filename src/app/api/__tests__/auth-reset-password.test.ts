/**
 * @jest-environment node
 */

const mockUser = {
  update: jest.fn(),
};

const mockToken = {
  findUnique: jest.fn(),
  deleteMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: mockUser, passwordResetToken: mockToken };
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('new-hashed-password'),
}));

import { POST } from '../auth/reset-password/route';

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  token: 'valid-token',
  password: 'newpassword123',
  confirmPassword: 'newpassword123',
};

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 and updates password for valid non-expired token', async () => {
    mockToken.findUnique.mockResolvedValue({
      token: 'valid-token',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour in future
    });
    mockUser.update.mockResolvedValue({});
    mockToken.deleteMany.mockResolvedValue({});

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.message).toBe('Password reset successfully');
  });

  it('returns 400 for expired token', async () => {
    mockToken.findUnique.mockResolvedValue({
      token: 'expired-token',
      userId: 'u1',
      expiresAt: new Date(Date.now() - 1000), // 1 second in past
    });

    const res = await POST(req({ ...validBody, token: 'expired-token' }));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Invalid or expired reset token');
  });

  it('returns 400 for non-existent token', async () => {
    mockToken.findUnique.mockResolvedValue(null);

    const res = await POST(req({ ...validBody, token: 'nonexistent' }));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Invalid or expired reset token');
  });

  it('returns 400 for missing token', async () => {
    const res = await POST(req({ password: 'newpass123', confirmPassword: 'newpass123' }));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Token is required');
  });

  it('returns 400 for missing password', async () => {
    const res = await POST(req({ token: 'valid-token', confirmPassword: 'newpass123' }));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Password must be at least 8 characters');
  });

  it('returns 400 for short password', async () => {
    const res = await POST(req({ token: 'valid-token', password: 'short', confirmPassword: 'short' }));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Password must be at least 8 characters');
  });

  it('returns 400 for mismatched passwords', async () => {
    const res = await POST(req({ token: 'valid-token', password: 'newpassword123', confirmPassword: 'different123' }));
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Passwords do not match');
  });

  it('deletes all tokens for the user after reset', async () => {
    mockToken.findUnique.mockResolvedValue({
      token: 'valid-token',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockUser.update.mockResolvedValue({});
    mockToken.deleteMany.mockResolvedValue({});

    await POST(req(validBody));

    expect(mockToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });

  it('hashes the new password before storing', async () => {
    const bcrypt = require('bcryptjs');
    mockToken.findUnique.mockResolvedValue({
      token: 'valid-token',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockUser.update.mockResolvedValue({});
    mockToken.deleteMany.mockResolvedValue({});

    await POST(req(validBody));

    expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: 'new-hashed-password' },
    });
  });
});
