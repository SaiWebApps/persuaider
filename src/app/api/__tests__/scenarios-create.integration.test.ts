/**
 * @jest-environment node
 */

/**
 * Real-Postgres integration test for POST /api/scenarios with sides and Issues:
 * roles are created, the learner side is recorded, each persona is linked to its
 * side, Issues are stored validated, and the scenario is unlisted by default.
 */
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

import { PrismaClient } from '@prisma/client';
import { POST } from '../scenarios/route';

const isPostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '');
const describeIfPostgres = isPostgres ? describe : describe.skip;
const prisma = new PrismaClient();
const tag = `it-${Date.now()}`;

describeIfPostgres('POST /api/scenarios (real database)', () => {
  let userId: string;
  const created: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `author-${tag}@example.com`, username: `author-${tag}`, emailVerified: new Date() } });
    userId = user.id;
    mockAuthFn.mockResolvedValue({ user: { id: userId, role: 'user' } });
  });

  afterAll(async () => {
    await prisma.scenario.deleteMany({ where: { id: { in: created } } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  const post = (body: unknown) => POST(new Request('http://localhost/api/scenarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const body = {
    title: `Used car ${tag}`, description: 'd', userRole: 'Buyer', aiRole: 'Seller',
    roles: [{ name: 'Buyer', description: 'brief A' }, { name: 'Seller', description: 'brief B' }],
    learnerRoleName: 'Buyer',
    issues: [{ name: 'Price', unit: 'USD', learnerWants: 'lower', learner: { target: 7000, reservation: 8500, weight: 100 }, counterpart: { target: 9500, reservation: 8000, weight: 100 } }],
    personas: [{ name: 'Sam', roleType: 'Seller', roleName: 'Seller', description: 'd' }],
  };

  it('stores sides, learner side, persona side, Issues, and keeps the scenario unlisted', async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    const { scenario } = await res.json();
    created.push(scenario.id);
    const row = await prisma.scenario.findUnique({ where: { id: scenario.id }, include: { roles: { orderBy: { displayOrder: 'asc' } }, personas: true } });
    expect(row!.visibility).toBe('unlisted');
    expect(row!.roles.map((r) => r.name)).toEqual(['Buyer', 'Seller']);
    expect(row!.learnerRoleId).toBe(row!.roles[0].id);
    expect(row!.personas[0].roleId).toBe(row!.roles[1].id);
    expect(JSON.parse(row!.issues)[0]).toMatchObject({ name: 'Price', learnerWants: 'lower' });
    const membership = await prisma.userScenario.findUnique({ where: { userId_scenarioId: { userId, scenarioId: scenario.id } } });
    expect(membership).not.toBeNull();
  });

  it('refuses a persona on the learner side and Issues whose numbers contradict their direction, creating nothing', async () => {
    const before = await prisma.scenario.count({ where: { createdById: userId } });
    expect((await post({ ...body, personas: [{ name: 'Sam', roleName: 'Buyer' }] })).status).toBe(400);
    expect((await post({ ...body, issues: [{ ...body.issues[0], learner: { target: 9000, reservation: 8500, weight: 100 } }] })).status).toBe(400);
    expect(await prisma.scenario.count({ where: { createdById: userId } })).toBe(before);
  });
});
