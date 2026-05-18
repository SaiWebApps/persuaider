/**
 * @jest-environment node
 */

const mockClerkAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
  currentUser: jest.fn(),
}));

const mockPrismaUser = {
  findUnique: jest.fn(),
};
jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: mockPrismaUser };
  },
}));

import { requireAdmin, isAdmin } from '../admin';

describe('requireAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 response when no session exists (no userId)', async () => {
    mockClerkAuth.mockResolvedValue({ userId: null, sessionClaims: null });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const data = await result!.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 401 response when user not found in DB', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk-123', sessionClaims: {} });
    mockPrismaUser.findUnique.mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it('returns 403 response when user role is "user"', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk-123', sessionClaims: {} });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const data = await result!.json();
    expect(data.error).toBe('Forbidden');
  });

  it('returns null (allow) when user role is "admin"', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk-123', sessionClaims: { metadata: { role: 'admin' } } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'u1', role: 'admin' });
    const result = await requireAdmin();
    expect(result).toBeNull();
  });

  it('returns 403 for unexpected role values like "moderator"', async () => {
    mockClerkAuth.mockResolvedValue({ userId: 'clerk-123', sessionClaims: {} });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'u1', role: 'moderator' });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});

describe('isAdmin', () => {
  it('returns true when role is "admin"', () => {
    expect(isAdmin({ user: { id: 'u1', role: 'admin', emailVerified: true } })).toBe(true);
  });

  it('returns false when role is "user"', () => {
    expect(isAdmin({ user: { id: 'u1', role: 'user', emailVerified: true } })).toBe(false);
  });

  it('returns false when session is null', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('is case-sensitive (Admin !== admin)', () => {
    expect(isAdmin({ user: { id: 'u1', role: 'Admin', emailVerified: true } })).toBe(false);
  });
});
