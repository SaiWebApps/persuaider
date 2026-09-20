/**
 * @jest-environment node
 */
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PATCH } from '../scenarios/[id]/route';

const isPostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '');
const describeIfPostgres = isPostgres ? describe : describe.skip;
const prisma = new PrismaClient();
const tag = `it-${Date.now()}`;

describeIfPostgres('PATCH /api/scenarios/[id] (real database)', () => {
  let ownerId: string; let strangerId: string; let scenarioId: string; let buyerId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `owner-${tag}@example.com`, username: `owner-${tag}` } });
    const stranger = await prisma.user.create({ data: { email: `stranger-${tag}@example.com`, username: `stranger-${tag}` } });
    ownerId = owner.id; strangerId = stranger.id;
    const s = await prisma.scenario.create({
      data: {
        title: `Edit ${tag}`, description: 'd', userRole: 'u', aiRole: 'a', evaluationCriteria: '{}', winCondition: '{}', joinCode: `E${tag}`.slice(0, 20), createdById: ownerId, visibility: 'unlisted',
        issues: JSON.stringify([{ name: 'Price', unit: 'USD', learnerWants: 'lower', learner: { target: 7000, reservation: 8500, weight: 100 }, counterpart: { target: 9500, reservation: 8000, weight: 100 } }]),
        roles: { create: [{ name: 'Buyer', description: 'old brief', displayOrder: 1 }, { name: 'Seller', description: 'B', displayOrder: 2 }] },
      },
      include: { roles: true },
    });
    scenarioId = s.id; buyerId = s.roles.find((r) => r.name === 'Buyer')!.id;
    await prisma.persona.create({ data: { scenarioId, roleId: s.roles.find((r) => r.name === 'Seller')!.id, name: 'Sam', description: 'd', roleType: 'r' } });
  });

  afterAll(async () => {
    await prisma.scenario.deleteMany({ where: { id: scenarioId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, strangerId] } } });
    await prisma.$disconnect();
  });

  const patch = (userId: string, body: unknown) =>
    (mockAuthFn.mockResolvedValue({ user: { id: userId, role: 'user' } }),
    PATCH(new NextRequest(`http://localhost/api/scenarios/${scenarioId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: scenarioId }) }));

  it('a stranger cannot edit: 404, nothing changes', async () => {
    expect((await patch(strangerId, { title: 'hacked' })).status).toBe(404);
    expect((await prisma.scenario.findUnique({ where: { id: scenarioId } }))!.title).toBe(`Edit ${tag}`);
  });

  it('the creator edits brief, numbers, learner side and visibility; the rows change', async () => {
    const res = await patch(ownerId, {
      visibility: 'public',
      roles: [{ id: buyerId, name: 'Buyer', description: 'new brief' }],
      learnerRoleId: buyerId,
      issues: [{ name: 'Price', unit: 'USD', learnerWants: 'lower', learner: { target: 7000, reservation: 8600, weight: 100 }, counterpart: { target: 9500, reservation: 8000, weight: 100 } }],
    });
    expect(res.status).toBe(200);
    const row = await prisma.scenario.findUnique({ where: { id: scenarioId }, include: { roles: true } });
    expect(row!.visibility).toBe('public');
    expect(row!.learnerRoleId).toBe(buyerId);
    expect(row!.roles.find((r) => r.id === buyerId)!.description).toBe('new brief');
    expect(JSON.parse(row!.issues)[0].learner.reservation).toBe(8600);
  });

  it('renaming the persona side renames the persona roleType and the scenario aiRole', async () => {
    const seller = await prisma.role.findFirst({ where: { scenarioId, name: 'Seller' } });
    expect((await patch(ownerId, { roles: [{ id: seller!.id, name: 'Owner', description: 'B' }] })).status).toBe(200);
    const persona = await prisma.persona.findFirst({ where: { scenarioId } });
    expect(persona!.roleType).toBe('Owner');
    expect((await prisma.scenario.findUnique({ where: { id: scenarioId } }))!.aiRole).toBe('Owner');
  });
});
