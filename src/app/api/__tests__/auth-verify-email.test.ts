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
    return { user: mockUser, emailVerificationToken: mockToken };
  },
}));

import { GET } from '../auth/verify-email/route';
import { NextRequest } from 'next/server';

function req(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/auth/verify-email');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

describe('GET /api/auth/verify-email', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 for missing token', async () => {
    const res = await GET(req());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid or expired verification link');
  });

  it('returns 400 for invalid token (not found)', async () => {
    mockToken.findUnique.mockResolvedValue(null);
    const res = await GET(req({ token: 'nonexistent-token' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid or expired verification link');
  });

  it('returns 400 for expired token', async () => {
    mockToken.findUnique.mockResolvedValue({
      token: 'expired-token',
      userId: 'u1',
      expiresAt: new Date(Date.now() - 1000), // 1 second in past
    });
    const res = await GET(req({ token: 'expired-token' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid or expired verification link');
  });

  it('returns redirect for valid token', async () => {
    mockToken.findUnique.mockResolvedValue({
      token: 'valid-token',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour in future
    });
    mockUser.update.mockResolvedValue({});
    mockToken.deleteMany.mockResolvedValue({});

    const res = await GET(req({ token: 'valid-token' }));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?verified=true');
  });

  it('sets emailVerified timestamp on user', async () => {
    mockToken.findUnique.mockResolvedValue({
      token: 'valid-token',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockUser.update.mockResolvedValue({});
    mockToken.deleteMany.mockResolvedValue({});

    await GET(req({ token: 'valid-token' }));

    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { emailVerified: expect.any(Date) },
    });
  });

  it('deletes all tokens for that user', async () => {
    mockToken.findUnique.mockResolvedValue({
      token: 'valid-token',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockUser.update.mockResolvedValue({});
    mockToken.deleteMany.mockResolvedValue({});

    await GET(req({ token: 'valid-token' }));

    expect(mockToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });
});
