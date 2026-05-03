/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

const mockScenario = { create: jest.fn(), findUnique: jest.fn() };
const mockPersona = { create: jest.fn() };
const mockUserScenario = { create: jest.fn(), findUnique: jest.fn() };
const mockUserDb = { findUnique: jest.fn() };

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { scenario: mockScenario, persona: mockPersona, userScenario: mockUserScenario, user: mockUserDb };
  },
}));

import { POST } from '../scenarios/route';

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/scenarios (user create)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await POST(req({ title: 'T', description: 'D', userRole: 'U', aiRole: 'A' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when title is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await POST(req({ description: 'D', userRole: 'U', aiRole: 'A' }));
    expect(res.status).toBe(400);
  });

  it('returns 201 and creates scenario with personas', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.create.mockResolvedValue({ id: 's1', title: 'Test', joinCode: 'ABCD1234' });
    mockPersona.create.mockResolvedValue({ id: 'p1' });
    mockUserScenario.create.mockResolvedValue({});

    const res = await POST(req({
      title: 'Test', description: 'Desc', userRole: 'User', aiRole: 'AI',
      personas: [{ name: 'P1', description: 'D', roleType: 'Skeptic' }],
    }));
    expect(res.status).toBe(201);
    expect(mockPersona.create).toHaveBeenCalled();
    expect(mockUserScenario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'u1', scenarioId: 's1' }),
    }));
  });

  it('auto-joins the creator', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.create.mockResolvedValue({ id: 's1', title: 'Test', joinCode: 'X' });
    await POST(req({ title: 'T', description: 'D', userRole: 'U', aiRole: 'A' }));
    expect(mockUserScenario.create).toHaveBeenCalled();
  });
});
