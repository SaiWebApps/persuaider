/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/admin/scenarios/[id] routes (GET, PATCH, DELETE).
 */

const mockRequireAdmin = jest.fn();
jest.mock('@/lib/auth/admin', () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockScenario = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { scenario: mockScenario };
  },
}));

import { GET, PATCH, DELETE } from '../admin/scenarios/[id]/route';
import { NextRequest, NextResponse } from 'next/server';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest('http://localhost/api/admin/scenarios/s1', {
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
// GET /api/admin/scenarios/[id]
// ---------------------------------------------------------------------------
describe('GET /api/admin/scenarios/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const req = createRequest('GET');
    const res = await GET(req, createParams('s1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const req = createRequest('GET');
    const res = await GET(req, createParams('s1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when scenario not found', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue(null);
    const req = createRequest('GET');
    const res = await GET(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  it('returns scenario with personas, members, and conversation count', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const scenarioRecord = {
      id: 's1',
      title: 'Budget Negotiation',
      description: 'Negotiate a department budget increase',
      personas: [
        { id: 'p1', name: 'CFO', displayOrder: 1 },
        { id: 'p2', name: 'VP Finance', displayOrder: 2 },
      ],
      members: [
        { user: { id: 'u1', email: 'a@test.com', username: 'Alice' } },
      ],
      _count: { conversations: 10 },
    };
    mockScenario.findUnique.mockResolvedValue(scenarioRecord);

    const req = createRequest('GET');
    const res = await GET(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenario.id).toBe('s1');
    expect(data.scenario.personas).toHaveLength(2);
    expect(data.scenario.members).toHaveLength(1);
    expect(data.scenario._count.conversations).toBe(10);
  });

  it('passes correct id to prisma', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue({ id: 'target-id' });

    const req = createRequest('GET');
    await GET(req, createParams('target-id'));
    expect(mockScenario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'target-id' } })
    );
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/scenarios/[id]
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/scenarios/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const req = createRequest('PATCH', { title: 'New Title' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const req = createRequest('PATCH', { title: 'New Title' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(403);
  });

  it('updates title', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const updated = { id: 's1', title: 'Updated Title' };
    mockScenario.update.mockResolvedValue(updated);

    const req = createRequest('PATCH', { title: 'Updated Title' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenario.title).toBe('Updated Title');
  });

  it('updates description', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const updated = { id: 's1', description: 'New description' };
    mockScenario.update.mockResolvedValue(updated);

    const req = createRequest('PATCH', { description: 'New description' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenario.description).toBe('New description');
  });

  it('updates status', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const updated = { id: 's1', status: 'published' };
    mockScenario.update.mockResolvedValue(updated);

    const req = createRequest('PATCH', { status: 'published' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenario.status).toBe('published');
  });

  it('updates multiple fields at once', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const updated = {
      id: 's1',
      title: 'New Title',
      description: 'New Desc',
      userRole: 'Negotiator',
      aiRole: 'Buyer',
      status: 'archived',
    };
    mockScenario.update.mockResolvedValue(updated);

    const req = createRequest('PATCH', {
      title: 'New Title',
      description: 'New Desc',
      userRole: 'Negotiator',
      aiRole: 'Buyer',
      status: 'archived',
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
    expect(mockScenario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1' },
        data: {
          title: 'New Title',
          description: 'New Desc',
          userRole: 'Negotiator',
          aiRole: 'Buyer',
          status: 'archived',
        },
      })
    );
  });

  it('sends empty update when no recognized fields provided', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.update.mockResolvedValue({ id: 's1' });

    const req = createRequest('PATCH', { unrecognized: 'field' });
    const res = await PATCH(req, createParams('s1'));
    // The route calls prisma.update with empty data; it won't 400
    expect(res.status).toBe(200);
    expect(mockScenario.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} })
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/scenarios/[id]
// ---------------------------------------------------------------------------
describe('DELETE /api/admin/scenarios/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const req = createRequest('DELETE');
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const req = createRequest('DELETE');
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when scenario not found', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue(null);
    const req = createRequest('DELETE');
    const res = await DELETE(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  it('deletes scenario and returns success', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue({ id: 's1' });
    mockScenario.delete.mockResolvedValue({ id: 's1' });

    const req = createRequest('DELETE');
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockScenario.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });
});
