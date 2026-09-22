/** @jest-environment node */
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PATCH } from '../personas/[id]/route';

const db = new PrismaClient();
const suite = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '') ? describe : describe.skip;
suite('Persona copy editing with real Postgres', () => {
  const users: string[] = [];
  let scenarioId: string | undefined;
  let personaId: string;
  beforeAll(async () => {
    const tag = `slice13-${Date.now()}`;
    for (const role of ['owner', 'stranger']) {
      const user = await db.user.create({ data: { email: `${role}-${tag}@example.com`, username: `${role}-${tag}` } });
      users.push(user.id);
    }
    const scenario = await db.scenario.create({ data: {
      title: tag, description: 'test', userRole: 'Tenant', aiRole: 'Landlord',
      createdById: users[0], evaluationCriteria: '{}', winCondition: '{}', joinCode: tag,
    } });
    scenarioId = scenario.id;
    const persona = await db.persona.create({ data: { scenarioId, name: 'Original', description: 'Original description', roleType: 'Landlord' } });
    personaId = persona.id;
  });
  afterAll(async () => {
    if (scenarioId) await db.scenario.deleteMany({ where: { id: scenarioId } });
    if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  const patch = (userId: string, body: unknown) => {
    mockAuthFn.mockResolvedValue({ user: { id: userId, role: 'user', emailVerified: true } });
    return PATCH(new NextRequest(`http://localhost/api/personas/${personaId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: personaId }) });
  };
  it('denies another user without changing the row', async () => {
    expect((await patch(users[1], { name: 'Stolen' })).status).toBe(403);
    expect((await db.persona.findUniqueOrThrow({ where: { id: personaId } })).name).toBe('Original');
  });
  it('persists all approved copy fields for the owner', async () => {
    const copy = { name: 'Morgan', description: 'Patient and exacting', initialGreeting: 'Discuss terms' };
    expect((await patch(users[0], copy)).status).toBe(200);
    expect(await db.persona.findUniqueOrThrow({ where: { id: personaId } })).toMatchObject(copy);
  });
  it('rejects invalid copy without partially writing the Persona', async () => {
    expect((await patch(users[0], { name: '', description: 'Must not persist' })).status).toBe(400);
    expect((await db.persona.findUniqueOrThrow({ where: { id: personaId } })).description).toBe('Patient and exacting');
  });
});
