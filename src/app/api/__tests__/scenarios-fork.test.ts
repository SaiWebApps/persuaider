/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

const mockScenario = { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() };
const mockPersona = { findMany: jest.fn(), create: jest.fn() };
const mockRole = { create: jest.fn() };
const mockUserScenario = { create: jest.fn() };
const mockUserDb = { findUnique: jest.fn() };

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { scenario: mockScenario, persona: mockPersona,
      role: mockRole, userScenario: mockUserScenario, user: mockUserDb };
  },
}));

jest.mock('crypto', () => ({
  randomBytes: () => ({ toString: () => 'AABBCCDD' }),
}));

import { POST } from '../scenarios/[id]/fork/route';
import { NextRequest } from 'next/server';

function req(id: string) {
  const request = new NextRequest('http://localhost/api/scenarios/' + id + '/fork', { method: 'POST' });
  return { request, params: Promise.resolve({ id }) };
}

const publishedPublicScenario = {
  id: 's1',
  title: 'Test Scenario',
  description: 'A test',
  userRole: 'Buyer',
  aiRole: 'Seller',
  evaluationCriteria: 'criteria',
  winCondition: 'win',
  tags: '["negotiation","sales"]',
  contextNotes: 'notes',
  issues: '[{"name":"Price"}]',
  status: 'published',
  visibility: 'public',
  accessCode: null,
  joinCode: 'ORIG1234',
  inspirationCount: 3,
  createdById: 'creator1',
  personas: [
    { id: 'p1', name: 'Alex', description: 'Desc', roleType: 'Manager', characteristics: 'char', initialGreeting: 'Hi', displayOrder: 1 },
    { id: 'p2', name: 'Sam', description: 'Desc2', roleType: 'Director', characteristics: 'char2', initialGreeting: 'Hello', displayOrder: 2 },
  ],
  members: [{ userId: 'member1' }],
};

describe('POST /api/scenarios/[id]/fork', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
    mockScenario.create.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'new-s1', ...args.data }));
    mockScenario.update.mockResolvedValue({});
    mockPersona.create.mockResolvedValue({});
    mockUserScenario.create.mockResolvedValue({});
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
  });

  it('returns 403 for unverified email', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: null });
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Email not verified');
  });

  it('returns 404 for non-existent scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(null);
    const { request, params } = req('nonexistent');
    const res = await POST(request, { params });
    expect(res.status).toBe(404);
  });

  it('returns 404 for draft scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ ...publishedPublicScenario, status: 'draft' });
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 for unlisted scenario user is not member of', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ ...publishedPublicScenario, visibility: 'unlisted', members: [{ userId: 'other-user' }] });
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Cannot fork this scenario');
  });

  it('returns 201 for fork of public published scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.scenario).toBeDefined();
    expect(data.scenario.title).toBe('Fork of Test Scenario');
  });

  it('fork sets forkedFromId correctly', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    await POST(request, { params });
    expect(mockScenario.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ forkedFromId: 's1' }) })
    );
  });

  it('fork copies all personas (verifies count and fields)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    await POST(request, { params });
    expect(mockPersona.create).toHaveBeenCalledTimes(2);
    expect(mockPersona.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Alex', roleType: 'Manager' }) })
    );
    expect(mockPersona.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Sam', roleType: 'Director' }) })
    );
  });

  it('fork generates different joinCode from source', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    await POST(request, { params });
    expect(mockScenario.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ joinCode: 'AABBCCDD' }) })
    );
    // Different from source
    expect('AABBCCDD').not.toBe(publishedPublicScenario.joinCode);
  });

  it('fork increments source inspirationCount atomically', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    await POST(request, { params });
    expect(mockScenario.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { inspirationCount: { increment: 1 } },
    });
  });

  it('fork auto-joins user to new scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    await POST(request, { params });
    expect(mockUserScenario.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1' }) })
    );
  });

  it('allows self-fork (fork own scenario)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'creator1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBe(201);
  });

  it('fork does NOT copy accessCode (fork is always open)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const restrictedScenario = { ...publishedPublicScenario, accessCode: 'secret123' };
    mockScenario.findUnique.mockResolvedValue(restrictedScenario);
    const { request, params } = req('s1');
    await POST(request, { params });
    const createCall = mockScenario.create.mock.calls[0][0];
    expect(createCall.data.accessCode).toBeUndefined();
  });

  it('fork scenario with 0 personas creates scenario without personas', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({ ...publishedPublicScenario, personas: [] });
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBe(201);
    expect(mockPersona.create).not.toHaveBeenCalled();
  });

  it('fork scenario with 20 personas copies all 20', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const manyPersonas = Array.from({ length: 20 }, (_, i) => ({
      id: 'p' + i, name: 'P' + i, description: 'D', roleType: 'R', characteristics: 'C', initialGreeting: 'G', displayOrder: i,
    }));
    mockScenario.findUnique.mockResolvedValue({ ...publishedPublicScenario, personas: manyPersonas });
    const { request, params } = req('s1');
    await POST(request, { params });
    expect(mockPersona.create).toHaveBeenCalledTimes(20);
  });

  it('concurrent forks increment inspirationCount correctly (atomic update)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    // Simulate concurrent forks
    const { request: r1, params: p1 } = req('s1');
    const { request: r2, params: p2 } = req('s1');
    await Promise.all([POST(r1, { params: p1 }), POST(r2, { params: p2 })]);
    // Both should call atomic increment
    expect(mockScenario.update).toHaveBeenCalledTimes(2);
    const calls = mockScenario.update.mock.calls;
    expect(calls[0][0].data.inspirationCount).toEqual({ increment: 1 });
    expect(calls[1][0].data.inspirationCount).toEqual({ increment: 1 });
  });

  it('fork scenario with XSS in title stores safely', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const xssScenario = { ...publishedPublicScenario, title: '<script>alert(1)</script>' };
    mockScenario.findUnique.mockResolvedValue(xssScenario);
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.scenario.title).toBe('Fork of <script>alert(1)</script>');
  });

  it('fork copies tags, description, evaluationCriteria, winCondition, contextNotes', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    await POST(request, { params });
    const createCall = mockScenario.create.mock.calls[0][0];
    expect(createCall.data.description).toBe('A test');
    expect(createCall.data.tags).toBe('["negotiation","sales"]');
    expect(createCall.data.evaluationCriteria).toBe('criteria');
    expect(createCall.data.winCondition).toBe('win');
    expect(createCall.data.contextNotes).toBe('notes');
    expect(createCall.data.issues).toBe(publishedPublicScenario.issues);
  });

  it('fork is unlisted (the forker may publish it later) and published', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    await POST(request, { params });
    const createCall = mockScenario.create.mock.calls[0][0];
    expect(createCall.data.visibility).toBe('unlisted');
    expect(createCall.data.status).toBe('published');
  });

  it('allows forking unlisted scenario when user IS a member', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'member1' } });
    mockScenario.findUnique.mockResolvedValue({ ...publishedPublicScenario, visibility: 'unlisted' });
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBe(201);
  });

  it('fork sets createdById to session user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue(publishedPublicScenario);
    const { request, params } = req('s1');
    await POST(request, { params });
    const createCall = mockScenario.create.mock.calls[0][0];
    expect(createCall.data.createdById).toBe('u1');
  });
});

describe('fork keeps sides', () => {
  beforeEach(() => jest.clearAllMocks());
  it('copies roles, re-links each persona to the copied side, and carries the learner side', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({
      ...publishedPublicScenario,
      learnerRoleId: 'r-emp',
      roles: [
        { id: 'r-emp', name: 'Employee', description: 'secret A', displayOrder: 1 },
        { id: 'r-mgr', name: 'Manager', description: 'secret B', displayOrder: 2 },
      ],
      personas: [{ id: 'p1', name: 'Alex', description: 'd', roleType: 'r', characteristics: null, initialGreeting: null, displayOrder: 1, roleId: 'r-mgr' }],
    });
    mockScenario.create.mockResolvedValue({ id: 'new-s', joinCode: 'ABCD1234' });
    mockRole.create.mockResolvedValueOnce({ id: 'new-emp' }).mockResolvedValueOnce({ id: 'new-mgr' });
    mockPersona.create.mockResolvedValue({ id: 'new-p' });
    mockScenario.update.mockResolvedValue({});
    const { request, params } = req('s1');
    const res = await POST(request, { params });
    expect(res.status).toBeLessThan(300);
    expect(mockRole.create).toHaveBeenCalledTimes(2);
    expect(mockRole.create.mock.calls[0][0].data).toMatchObject({ scenarioId: 'new-s', name: 'Employee', description: 'secret A' });
    expect(mockPersona.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roleId: 'new-mgr' }) }));
    expect(mockScenario.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'new-s' }, data: { learnerRoleId: 'new-emp' } }));
  });
});
