/**
 * @jest-environment node
 */

/**
 * Real-Postgres test for POST /api/scenarios/join, which the share link rides on:
 * a verified learner joins once (membership row appears), joining again is 409,
 * unknown or unpublished codes are 404, an access code is enforced, and the code
 * is case-insensitive. Runs when DATABASE_URL points at Postgres.
 */
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

import { PrismaClient } from '@prisma/client';
import { POST } from '../scenarios/join/route';

const isPostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '');
const describeIfPostgres = isPostgres ? describe : describe.skip;
const prisma = new PrismaClient();
const tag = `it-${Date.now()}`;
const digits = tag.replace(/\D/g, '');
const code = `J${digits}`.slice(0, 12);
const lockedCode = `L${digits}`.slice(0, 12);
const draftCode = `D${digits}`.slice(0, 12);

describeIfPostgres('POST /api/scenarios/join (real database)', () => {
  let userId: string; let creatorId: string; let openId: string; let lockedId: string; let draftId: string;

  beforeAll(async () => {
    const creator = await prisma.user.create({ data: { email: `creator-${tag}@example.com`, username: `creator-${tag}`, emailVerified: new Date() } });
    const user = await prisma.user.create({ data: { email: `joiner-${tag}@example.com`, username: `joiner-${tag}`, emailVerified: new Date() } });
    creatorId = creator.id; userId = user.id;
    const base = { description: 'd', userRole: 'u', aiRole: 'a', evaluationCriteria: '{}', winCondition: '{}', createdById: creatorId, status: 'published' };
    openId = (await prisma.scenario.create({ data: { ...base, title: `Open ${tag}`, joinCode: code } })).id;
    lockedId = (await prisma.scenario.create({ data: { ...base, title: `Locked ${tag}`, joinCode: lockedCode, accessCode: 'secret' } })).id;
    draftId = (await prisma.scenario.create({ data: { ...base, title: `Draft ${tag}`, joinCode: draftCode, status: 'draft' } })).id;
  });

  afterAll(async () => {
    await prisma.scenario.deleteMany({ where: { id: { in: [openId, lockedId, draftId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, creatorId] } } });
    await prisma.$disconnect();
  });

  const join = (who: string | null, body: unknown) => {
    mockAuthFn.mockResolvedValue(who ? { user: { id: who, role: 'user' } } : null);
    return POST(new Request('http://localhost/api/scenarios/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  };

  it('signed out is 401 and no row is written', async () => {
    expect((await join(null, { joinCode: code })).status).toBe(401);
    expect(await prisma.userScenario.count({ where: { scenarioId: openId } })).toBe(0);
  });

  it('a lower-case code joins once; the membership row exists; again is 409', async () => {
    const res = await join(userId, { joinCode: code.toLowerCase() });
    expect(res.status).toBe(200);
    expect((await res.json()).scenario).toMatchObject({ id: openId, title: `Open ${tag}` });
    expect(await prisma.userScenario.count({ where: { userId, scenarioId: openId } })).toBe(1);
    expect((await join(userId, { joinCode: code })).status).toBe(409);
    expect(await prisma.userScenario.count({ where: { userId, scenarioId: openId } })).toBe(1);
  });

  it('unknown and unpublished codes are 404', async () => {
    expect((await join(userId, { joinCode: 'NOPE0000' })).status).toBe(404);
    expect((await join(userId, { joinCode: draftCode })).status).toBe(404);
  });

  it('an access code is required and checked', async () => {
    const denied = await join(userId, { joinCode: lockedCode });
    expect(denied.status).toBe(403);
    expect((await denied.json()).requiresAccessCode).toBe(true);
    expect((await join(userId, { joinCode: lockedCode, accessCode: 'wrong' })).status).toBe(403);
    expect((await join(userId, { joinCode: lockedCode, accessCode: 'secret' })).status).toBe(200);
    expect(await prisma.userScenario.count({ where: { userId, scenarioId: lockedId } })).toBe(1);
  });
});
