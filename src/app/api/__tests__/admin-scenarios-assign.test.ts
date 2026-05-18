/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/admin/scenarios/[id]/assign routes (POST, DELETE).
 */

const mockRequireAdmin = jest.fn();
jest.mock('@/lib/auth/admin', () => ({
  requireAdmin: () => mockRequireAdmin(),
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
import { NextRequest, NextResponse } from 'next/server';

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
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const req = createRequest('POST', { userId: 'u1' });
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const req = createRequest('POST', { userId: 'u1' });
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when userId is missing', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const req = createRequest('POST', {});
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/userId/i);
  });

  it('returns 409 when user is already assigned', async () => {
    mockRequireAdmin.mockResolvedValue(null);
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
    mockRequireAdmin.mockResolvedValue(null);
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
    mockRequireAdmin.mockResolvedValue(null);
    mockUserScenario.findUnique.mockResolvedValue(null);
    mockUserScenario.create.mockResolvedValue({ userId: 'u2', scenarioId: 's5' });

    const req = createRequest('POST', { userId: 'u2' });
    await POST(req, createParams('s5'));
    expect(mockUserScenario.findUnique).toHaveBeenCalledWith({
      where: { userId_scenarioId: { userId: 'u2', scenarioId: 's5' } },
    });
  });

  it('passes correct data to create', async () => {
    mockRequireAdmin.mockResolvedValue(null);
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
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const req = createRequest('DELETE', { userId: 'u1' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const req = createRequest('DELETE', { userId: 'u1' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when userId is missing', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const req = createRequest('DELETE', {});
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/userId/i);
  });

  it('deletes assignment and returns success', async () => {
    mockRequireAdmin.mockResolvedValue(null);
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
    mockRequireAdmin.mockResolvedValue(null);
    mockUserScenario.deleteMany.mockResolvedValue({ count: 0 });

    const req = createRequest('DELETE', { userId: 'u99' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
