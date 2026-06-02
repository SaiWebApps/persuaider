/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockRole = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockScenario = {
  findUnique: jest.fn(),
};

const mockPersona = {
  updateMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { role: mockRole, scenario: mockScenario, persona: mockPersona };
  },
}));

import { NextRequest } from 'next/server';
import { GET, POST } from '../admin/roles/route';
import { GET as GET_ID, PATCH, DELETE } from '../admin/roles/[id]/route';

function makeRequest(url: string, options?: RequestInit) {
  return new NextRequest(url, options);
}

describe('GET /api/admin/roles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = makeRequest('http://localhost/api/admin/roles?scenarioId=s1');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = makeRequest('http://localhost/api/admin/roles?scenarioId=s1');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 without scenarioId', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    const req = makeRequest('http://localhost/api/admin/roles');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns roles for scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockRole.findMany.mockResolvedValue([
      { id: 'r1', name: 'Buyer', description: 'The buyer role', scenarioId: 's1', personas: [] },
    ]);
    const req = makeRequest('http://localhost/api/admin/roles?scenarioId=s1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.roles).toHaveLength(1);
    expect(data.roles[0].name).toBe('Buyer');
  });
});

describe('POST /api/admin/roles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = makeRequest('http://localhost/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 's1', name: 'Test', description: 'Desc' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = makeRequest('http://localhost/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 's1', name: 'Test', description: 'Desc' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 without scenarioId', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    const req = makeRequest('http://localhost/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', description: 'Desc' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 with empty name', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    const req = makeRequest('http://localhost/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 's1', name: '', description: 'Desc' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 with name exceeding 200 chars', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    const req = makeRequest('http://localhost/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 's1', name: 'A'.repeat(201), description: 'Desc' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 404 if scenario does not exist', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockScenario.findUnique.mockResolvedValue(null);
    const req = makeRequest('http://localhost/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 'nonexistent', name: 'Test', description: 'Desc' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('creates role with valid data and returns 201', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockScenario.findUnique.mockResolvedValue({ id: 's1' });
    mockRole.create.mockResolvedValue({
      id: 'r1', scenarioId: 's1', name: 'Buyer', description: 'The buyer', displayOrder: 0,
    });
    const req = makeRequest('http://localhost/api/admin/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 's1', name: 'Buyer', description: 'The buyer' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.role.name).toBe('Buyer');
  });
});

describe('GET /api/admin/roles/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = makeRequest('http://localhost/api/admin/roles/r1');
    const res = await GET_ID(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = makeRequest('http://localhost/api/admin/roles/r1');
    const res = await GET_ID(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent role', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockRole.findUnique.mockResolvedValue(null);
    const req = makeRequest('http://localhost/api/admin/roles/r1');
    const res = await GET_ID(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(404);
  });

  it('returns role with personas', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockRole.findUnique.mockResolvedValue({
      id: 'r1', name: 'Seller', description: 'Sells things', personas: [{ id: 'p1', name: 'Alice' }],
    });
    const req = makeRequest('http://localhost/api/admin/roles/r1');
    const res = await GET_ID(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.role.personas).toHaveLength(1);
  });
});

describe('PATCH /api/admin/roles/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 for non-admin', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = makeRequest('http://localhost/api/admin/roles/r1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent role', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockRole.findUnique.mockResolvedValue(null);
    const req = makeRequest('http://localhost/api/admin/roles/r1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(404);
  });

  it('updates role name successfully', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockRole.findUnique.mockResolvedValue({ id: 'r1', name: 'Old', description: 'Desc' });
    mockRole.update.mockResolvedValue({ id: 'r1', name: 'New Name', description: 'Desc' });
    const req = makeRequest('http://localhost/api/admin/roles/r1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.role.name).toBe('New Name');
  });
});

describe('DELETE /api/admin/roles/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 for non-admin', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const req = makeRequest('http://localhost/api/admin/roles/r1', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent role', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockRole.findUnique.mockResolvedValue(null);
    const req = makeRequest('http://localhost/api/admin/roles/r1', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(404);
  });

  it('deletes role and nullifies persona roleId', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockRole.findUnique.mockResolvedValue({ id: 'r1', name: 'Role' });
    mockPersona.updateMany.mockResolvedValue({ count: 2 });
    mockRole.delete.mockResolvedValue({ id: 'r1' });
    const req = makeRequest('http://localhost/api/admin/roles/r1', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(200);
    expect(mockPersona.updateMany).toHaveBeenCalledWith({
      where: { roleId: 'r1' },
      data: { roleId: null },
    });
  });
});
