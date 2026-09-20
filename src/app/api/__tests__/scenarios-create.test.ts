/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

const mockScenario = { create: jest.fn(), findUnique: jest.fn() };
const mockPersona = { create: jest.fn() };
const mockRole = { create: jest.fn() };
const mockUserScenario = { create: jest.fn(), findUnique: jest.fn() };
const mockUserDb = { findUnique: jest.fn() };

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { scenario: mockScenario, persona: mockPersona, role: mockRole, userScenario: mockUserScenario, user: mockUserDb };
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

describe('POST /api/scenarios - sides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
    mockScenario.create.mockResolvedValue({ id: 's-new', joinCode: 'ABCD' });
    mockScenario.update = jest.fn().mockResolvedValue({});
    mockRole.create.mockResolvedValueOnce({ id: 'r-buyer' }).mockResolvedValueOnce({ id: 'r-seller' });
    mockPersona.create.mockResolvedValue({ id: 'p1' });
    mockUserScenario.create.mockResolvedValue({});
  });
  const body = {
    title: 'Used car', description: 'd', userRole: 'Buyer', aiRole: 'Seller',
    roles: [{ name: 'Buyer', description: 'brief A' }, { name: 'Seller', description: 'brief B' }],
    learnerRoleName: 'Buyer',
    personas: [{ name: 'Sam', roleType: 'Seller', roleName: 'Seller' }],
  };
  const post = (b: unknown) => POST(new Request('http://localhost/api/scenarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }));

  it('creates roles, marks the learner side, and links each persona to its side', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(mockRole.create).toHaveBeenCalledTimes(2);
    expect(mockRole.create.mock.calls[0][0].data).toMatchObject({ scenarioId: 's-new', name: 'Buyer', description: 'brief A', displayOrder: 1 });
    expect(mockScenario.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's-new' }, data: { learnerRoleId: 'r-buyer' } }));
    expect(mockPersona.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roleId: 'r-seller' }) }));
  });

  it('rejects a persona placed on the learner side and duplicate role names', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    expect((await post({ ...body, personas: [{ name: 'Sam', roleName: 'Buyer' }] })).status).toBe(400);
    expect((await post({ ...body, roles: [{ name: 'Buyer' }, { name: 'buyer' }] })).status).toBe(400);
    expect(mockScenario.create).not.toHaveBeenCalled();
  });

  it('rejects a learner side or persona side that is not one of the roles', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    expect((await post({ ...body, learnerRoleName: 'Referee' })).status).toBe(400);
    expect((await post({ ...body, personas: [{ name: 'Sam', roleName: 'Referee' }] })).status).toBe(400);
    expect(mockScenario.create).not.toHaveBeenCalled();
  });
});
