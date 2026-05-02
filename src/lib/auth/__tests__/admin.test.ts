/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

import { requireAdmin, isAdmin } from '../admin';

describe('requireAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 response when no session exists', async () => {
    mockAuthFn.mockResolvedValue(null);
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const data = await result!.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 403 response when user role is "user"', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const data = await result!.json();
    expect(data.error).toBe('Forbidden');
  });

  it('returns null (allow) when user role is "admin"', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    const result = await requireAdmin();
    expect(result).toBeNull();
  });

  it('returns 403 when role property is missing from user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('returns 403 for unexpected role values like "moderator"', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'moderator' } });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('returns 403 when role is empty string', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: '' } });
    const result = await requireAdmin();
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});

describe('isAdmin', () => {
  it('returns true when role is "admin"', () => {
    expect(isAdmin({ user: { role: 'admin' } })).toBe(true);
  });

  it('returns false when role is "user"', () => {
    expect(isAdmin({ user: { role: 'user' } })).toBe(false);
  });

  it('returns false when session is null', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('returns false when role is undefined', () => {
    expect(isAdmin({ user: {} })).toBe(false);
  });

  it('returns false when role is empty string', () => {
    expect(isAdmin({ user: { role: '' } })).toBe(false);
  });

  it('is case-sensitive (Admin !== admin)', () => {
    expect(isAdmin({ user: { role: 'Admin' } })).toBe(false);
  });
});
