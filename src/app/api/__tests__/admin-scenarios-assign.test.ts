/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/admin/scenarios/[id]/assign routes (POST, DELETE).
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockUserScenario = {
  findUnique: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { userScenario: mockUserScenario };
  },
}));

import { POST, DELETE } from '../admin/scenarios/[id]/assign/route';
import { NextRequest } from 'next/server';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest('http://localhost/api/admin/scenarios/s1/assign', {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// POST /api/admin/scenarios/[id]/assign
// ---------------------------------------------------------------------------
describe('POST /api/admin/scenarios/[id]/assign', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest('POST', { userId: 'u1' });
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = createRequest('POST', { userId: 'u1' });
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when userId is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    const req = createRequest('POST', {});
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/userId/i);
  });

  it('returns 409 when user is already assigned', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUserScenario.findUnique.mockResolvedValue({
      userId: 'u1',
      scenarioId: 's1',
    });

    const req = createRequest('POST', { userId: 'u1' });
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/already assigned/i);
  });

  it('creates assignment and returns 201', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUserScenario.findUnique.mockResolvedValue(null);
    const assignment = { userId: 'u1', scenarioId: 's1', id: 'us-1' };
    mockUserScenario.create.mockResolvedValue(assignment);

    const req = createRequest('POST', { userId: 'u1' });
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.assignment.userId).toBe('u1');
    expect(data.assignment.scenarioId).toBe('s1');
  });

  it('uses correct compound key for duplicate check', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUserScenario.findUnique.mockResolvedValue(null);
    mockUserScenario.create.mockResolvedValue({ userId: 'u2', scenarioId: 's5' });

    const req = createRequest('POST', { userId: 'u2' });
    await POST(req, createParams('s5'));
    expect(mockUserScenario.findUnique).toHaveBeenCalledWith({
      where: { userId_scenarioId: { userId: 'u2', scenarioId: 's5' } },
    });
  });

  it('passes correct data to create', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUserScenario.findUnique.mockResolvedValue(null);
    mockUserScenario.create.mockResolvedValue({ userId: 'u3', scenarioId: 's2' });

    const req = createRequest('POST', { userId: 'u3' });
    await POST(req, createParams('s2'));
    expect(mockUserScenario.create).toHaveBeenCalledWith({
      data: { userId: 'u3', scenarioId: 's2' },
    });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/scenarios/[id]/assign
// ---------------------------------------------------------------------------
describe('DELETE /api/admin/scenarios/[id]/assign', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest('DELETE', { userId: 'u1' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = createRequest('DELETE', { userId: 'u1' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when userId is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    const req = createRequest('DELETE', {});
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/userId/i);
  });

  it('deletes assignment and returns success', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUserScenario.deleteMany.mockResolvedValue({ count: 1 });

    const req = createRequest('DELETE', { userId: 'u1' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockUserScenario.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', scenarioId: 's1' },
    });
  });

  it('succeeds even when no assignment existed (idempotent)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUserScenario.deleteMany.mockResolvedValue({ count: 0 });

    const req = createRequest('DELETE', { userId: 'u99' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
