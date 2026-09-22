/**
 * @jest-environment node
 */
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/client';
import { PATCH } from '../scenarios/[id]/route';

const describePostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '') ? describe : describe.skip;

describePostgres('legacy Issue saves (real PostgreSQL)', () => {
  let ownerId: string;
  let strangerId: string;
  let scenarioId: string;
  const tag = randomUUID();
  const read = () => prisma.scenario.findUniqueOrThrow({
    where: { id: scenarioId },
    include: { roles: { orderBy: { displayOrder: 'asc' } }, personas: { orderBy: { displayOrder: 'asc' } } },
  });
  const payload = (name = 'Salary') => ({
    roles: [
      { id: `${scenarioId}:legacy-user`, name: 'Employee', description: 'My confidential brief.' },
      { id: `${scenarioId}:legacy-ai`, name: 'Evil Boss', description: 'Their confidential brief.' },
    ],
    learnerRoleId: `${scenarioId}:legacy-user`,
    issues: [{ name, unit: 'USD', learnerWants: 'lower',
      learner: { target: 0, reservation: 100, weight: 100 },
      counterpart: { target: 100, reservation: 0, weight: 100 } }],
  });
  const patch = (body: unknown) => PATCH(new NextRequest(`http://localhost/api/scenarios/${scenarioId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: scenarioId }) });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `owner-${tag}@example.com`, username: `owner-${tag}` } })).id;
    strangerId = (await prisma.user.create({ data: { email: `stranger-${tag}@example.com`, username: `stranger-${tag}` } })).id;
  });
  beforeEach(async () => {
    scenarioId = (await prisma.scenario.create({ data: {
      title: 'Legacy salary negotiation', description: 'Employee negotiates salary with the boss.',
      userRole: 'Employee', aiRole: 'Evil Boss', evaluationCriteria: '{}', winCondition: '{}',
      joinCode: randomUUID(), createdById: ownerId,
      personas: { create: [
        { name: 'Oliver', description: 'Wants a raise.', roleType: 'Employee', initialGreeting: 'Hello.', displayOrder: 0 },
        { name: 'Boss', description: 'Controls pay.', roleType: 'Boss', initialGreeting: 'What do you want?', displayOrder: 1 },
      ] },
    } })).id;
    mockAuthFn.mockResolvedValue({ user: { id: ownerId, role: 'user' } });
  });
  afterEach(async () => { await prisma.scenario.delete({ where: { id: scenarioId } }); });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, strangerId] } } });
    await prisma.$disconnect();
  });

  it('saves editable default sides and an Issue; a second save/reload retains IDs and all Persona data', async () => {
    const before = await read();
    expect(before.roles).toHaveLength(0);
    expect(before.personas.map((p) => p.roleId)).toEqual([null, null]);
    expect((await patch(payload())).status).toBe(200);
    const first = await read();
    expect(first.roles.map(({ id, name, description }) => ({ id, name, description }))).toEqual(payload().roles);
    expect(first.learnerRoleId).toBe(first.roles[0].id);
    expect(JSON.parse(first.issues)).toEqual(payload().issues);
    expect(first.personas).toEqual(before.personas);

    const secondPayload = { ...payload('Annual salary'), roles: first.roles.map((r, i) => ({
      id: r.id, name: i === 0 ? 'Senior Employee' : 'Manager', description: `${r.description} Edited.`,
    })) };
    expect((await patch(secondPayload)).status).toBe(200);
    const second = await read();
    expect(second.roles.map(({ id, name, description }) => ({ id, name, description }))).toEqual(secondPayload.roles);
    expect(JSON.parse(second.issues)).toEqual(secondPayload.issues);
    expect(second).toMatchObject({ userRole: 'Senior Employee', aiRole: 'Manager' });
    expect(second.personas).toEqual(before.personas);
  });

  it('serializes concurrent first saves and permits retry without duplicate sides', async () => {
    const before = await read();
    const responses = await Promise.all([patch(payload()), patch(payload())]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect((await patch(payload('Annual salary'))).status).toBe(200);
    const after = await read();
    expect(after.roles.map((r) => r.id)).toEqual(payload().roles.map((r) => r.id));
    expect(JSON.parse(after.issues)[0].name).toBe('Annual salary');
    expect(after.personas).toEqual(before.personas);
  });

  it('rejects strangers and anonymous requests without creating sides or changing copy', async () => {
    const before = await read();
    mockAuthFn.mockResolvedValue({ user: { id: strangerId, role: 'user' } });
    expect((await patch(payload())).status).toBe(404);
    mockAuthFn.mockResolvedValue(null);
    expect((await patch(payload())).status).toBe(401);
    expect(await read()).toEqual(before);
  });

  it('invalid direction or side IDs leave the legacy scenario untouched', async () => {
    const before = await read();
    const invalid = payload();
    invalid.issues[0].learner.target = 101;
    expect((await patch(invalid)).status).toBe(400);
    const unknown = payload();
    unknown.roles[0].id = 'another-scenarios-role';
    expect((await patch(unknown)).status).toBe(400);
    expect(await read()).toEqual(before);
  });

  it('a failed Scenario write rolls back newly created sides', async () => {
    const before = await read();
    // PostgreSQL text cannot contain NUL. This fails the Scenario write after
    // Role inserts, exercising actual transaction rollback rather than a mock.
    await expect(patch({ ...payload(), title: 'Invalid\u0000title' })).rejects.toThrow();
    expect(await read()).toEqual(before);
  });

  it('still rejects Issues for a scenario with more than two sides', async () => {
    await prisma.role.createMany({ data: ['One', 'Two', 'Three'].map((name) => ({ scenarioId, name, description: '' })) });
    const before = await read();
    expect((await patch({ issues: payload().issues })).status).toBe(400);
    expect(await read()).toEqual(before);
  });
});
