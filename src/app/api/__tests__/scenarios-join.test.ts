/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

const mockScenario = { findUnique: jest.fn() };
const mockUserScenario = { findUnique: jest.fn(), create: jest.fn() };
const mockUserDb = { findUnique: jest.fn() };

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { scenario: mockScenario, userScenario: mockUserScenario, user: mockUserDb };
  },
}));

import { POST } from '../scenarios/join/route';

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/scenarios/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/scenarios/join', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await POST(req({ joinCode: 'ABC' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing joinCode', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 for invalid code', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(null);
    const res = await POST(req({ joinCode: 'INVALID' }));
    expect(res.status).toBe(404);
  });

  it('returns 404 for unpublished scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ id: 's1', status: 'draft' });
    const res = await POST(req({ joinCode: 'DRAFT1' }));
    expect(res.status).toBe(404);
  });

  it('returns 409 when already joined', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ id: 's1', status: 'published' });
    mockUserScenario.findUnique.mockResolvedValue({ id: 'existing' });
    const res = await POST(req({ joinCode: 'CODE1' }));
    expect(res.status).toBe(409);
  });

  it('returns 200 and creates membership for valid code', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ id: 's1', title: 'Test', description: 'D', status: 'published' });
    mockUserScenario.findUnique.mockResolvedValue(null);
    mockUserScenario.create.mockResolvedValue({});
    const res = await POST(req({ joinCode: 'CODE1' }));
    expect(res.status).toBe(200);
    expect(mockUserScenario.create).toHaveBeenCalled();
  });

  it('normalizes joinCode to uppercase', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ id: 's1', title: 'Test', description: 'D', status: 'published' });
    mockUserScenario.findUnique.mockResolvedValue(null);
    mockUserScenario.create.mockResolvedValue({});
    await POST(req({ joinCode: 'abc123' }));
    expect(mockScenario.findUnique).toHaveBeenCalledWith({ where: { joinCode: 'ABC123' } });
  });

  it('returns 403 for restricted scenario without access code', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ id: 's1', status: 'published', accessCode: 'secret' });
    const res = await POST(req({ joinCode: 'CODE1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.requiresAccessCode).toBe(true);
  });

  it('returns 403 for wrong access code', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ id: 's1', status: 'published', accessCode: 'secret' });
    const res = await POST(req({ joinCode: 'CODE1', accessCode: 'wrong' }));
    expect(res.status).toBe(403);
  });

  it('returns 200 for correct access code on restricted scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ id: 's1', title: 'T', description: 'D', status: 'published', accessCode: 'secret' });
    mockUserScenario.findUnique.mockResolvedValue(null);
    mockUserScenario.create.mockResolvedValue({});
    const res = await POST(req({ joinCode: 'CODE1', accessCode: 'secret' }));
    expect(res.status).toBe(200);
  });

  it('allows joining open scenario without access code', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ id: 's1', title: 'T', description: 'D', status: 'published', accessCode: null });
    mockUserScenario.findUnique.mockResolvedValue(null);
    mockUserScenario.create.mockResolvedValue({});
    const res = await POST(req({ joinCode: 'CODE1' }));
    expect(res.status).toBe(200);
  });
});
