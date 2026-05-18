/**
 * @jest-environment node
 */

const mockClerkAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
  currentUser: jest.fn(),
}));

const mockFindUnique = jest.fn();
jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: { findUnique: mockFindUnique } };
  },
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

import { getAuthSession, requireAdmin, requireVerifiedUser, isAdmin, signOut } from '../clerk';

describe('getAuthSession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when userId is null', async () => {
    mockClerkAuth.mockResolvedValue({ userId: null, sessionClaims: null });
    const result = await getAuthSession();
    expect(result).toBeNull();
  });

  it('returns null when userId is undefined', async () => {
    mockClerkAuth.mockResolvedValue({ userId: undefined, sessionClaims: null });
    const result = await getAuthSession();
    expect(result).toBeNull();
  });

  it('returns null when user not found in DB (prisma returns null)', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_123', sessionClaims: {} });
    mockFindUnique.mockResolvedValue(null);
    const result = await getAuthSession();
    expect(result).toBeNull();
  });

  it('returns session with DB role when sessionClaims has no metadata', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_123', sessionClaims: {} });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    const result = await getAuthSession();
    expect(result).toEqual({
      user: { id: 'u1', role: 'user', emailVerified: true },
    });
  });

  it('returns session with DB role when sessionClaims is null', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_123', sessionClaims: null });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'admin' });
    const result = await getAuthSession();
    expect(result).toEqual({
      user: { id: 'u1', role: 'admin', emailVerified: true },
    });
  });

  it('prefers sessionClaims.metadata.role over DB role', async () => {
    mockClerkAuth.mockResolvedValue({
      userId: 'clerk_123',
      sessionClaims: { metadata: { role: 'admin' } },
    });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    const result = await getAuthSession();
    expect(result).toEqual({
      user: { id: 'u1', role: 'admin', emailVerified: true },
    });
  });

  it('falls back to DB role when metadata.role is empty string', async () => {
    mockClerkAuth.mockResolvedValue({
      userId: 'clerk_123',
      sessionClaims: { metadata: { role: '' } },
    });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    const result = await getAuthSession();
    expect(result).toEqual({
      user: { id: 'u1', role: 'user', emailVerified: true },
    });
  });

  it('falls back to DB role when metadata is non-object', async () => {
    mockClerkAuth.mockResolvedValue({
      userId: 'clerk_123',
      sessionClaims: { metadata: 'not-an-object' },
    });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    const result = await getAuthSession();
    expect(result).toEqual({
      user: { id: 'u1', role: 'user', emailVerified: true },
    });
  });

  it('queries prisma with correct clerkId', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_abc_xyz', sessionClaims: {} });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    await getAuthSession();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { clerkId: 'clerk_abc_xyz' },
      select: { id: true, role: true },
    });
  });

  it('returns null when auth() throws (Clerk down)', async () => {
    mockClerkAuth.mockRejectedValue(new Error('Clerk service unavailable'));
    const result = await getAuthSession();
    expect(result).toBeNull();
  });
});

describe('requireAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no session (userId null)', async () => {
    mockClerkAuth.mockResolvedValue({ userId: null, sessionClaims: null });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const data = await result!.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 401 when user not in DB', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_123', sessionClaims: {} });
    mockFindUnique.mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns 403 when role is user', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_123', sessionClaims: {} });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const data = await result!.json();
    expect(data.error).toBe('Forbidden');
  });

  it('returns null when role is admin', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_123', sessionClaims: {} });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'admin' });
    const result = await requireAdmin();
    expect(result).toBeNull();
  });

  it('returns 403 for non-standard role strings', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_123', sessionClaims: {} });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'moderator' });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});

describe('requireVerifiedUser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no session', async () => {
    mockClerkAuth.mockResolvedValue({ userId: null, sessionClaims: null });
    const result = await requireVerifiedUser();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns null for any valid user', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_123', sessionClaims: {} });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    const result = await requireVerifiedUser();
    expect(result).toBeNull();
  });

  it('returns null for admin user', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk_123', sessionClaims: {} });
    mockFindUnique.mockResolvedValue({ id: 'u1', role: 'admin' });
    const result = await requireVerifiedUser();
    expect(result).toBeNull();
  });
});

describe('isAdmin', () => {
  it('returns true for admin', () => {
    expect(isAdmin({ user: { id: 'u1', role: 'admin', emailVerified: true } })).toBe(true);
  });

  it('returns false for user', () => {
    expect(isAdmin({ user: { id: 'u1', role: 'user', emailVerified: true } })).toBe(false);
  });

  it('returns false for null session', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isAdmin(undefined as never)).toBe(false);
  });
});

describe('signOut', () => {
  it('calls redirect to /login', async () => {
    const { redirect } = await import('next/navigation');
    try {
      await signOut();
    } catch {
      // redirect throws in test environment
    }
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
