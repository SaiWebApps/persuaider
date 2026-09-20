/**
 * @jest-environment node
 */

/**
 * Real-Postgres integration tests for two touched routes:
 *  - PATCH /api/conversations/[id]/summary: only the owner can record "felt real".
 *  - POST /api/conversations/[id]/messages: the scenario's message limit is enforced
 *    from the real message count, not from a truncated window.
 * Only auth and the model are faked; the database is real.
 */
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
const mockGenerate = jest.fn().mockResolvedValue({ content: '{"mood":"neutral","content":"ok"}' });
jest.mock('@/lib/llm', () => ({ generatePersonaResponse: (...args: unknown[]) => mockGenerate(...args) }));
jest.mock('@/lib/llm/usage', () => ({
  assertWithinBudget: jest.fn().mockResolvedValue({ spentUsd: 0, calls: 0, budgetUsd: 2 }),
  recordLlmCall: jest.fn().mockResolvedValue(undefined),
  getDailyUsage: jest.fn().mockResolvedValue({ spentUsd: 0, calls: 0, budgetUsd: 2 }),
  estimatedResponse: () => ({ content: '', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }),
}));

import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PATCH } from '../conversations/[id]/summary/route';
import { POST as sendMessage } from '../conversations/[id]/messages/route';

const isPostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '');
const describeIfPostgres = isPostgres ? describe : describe.skip;
const prisma = new PrismaClient();
const tag = `it-${Date.now()}`;

describeIfPostgres('summary PATCH and message limit (real database)', () => {
  let ownerId: string;
  let strangerId: string;
  let conversationId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `owner-${tag}@example.com`, username: `owner-${tag}`, emailVerified: new Date() } });
    const stranger = await prisma.user.create({ data: { email: `stranger-${tag}@example.com`, username: `stranger-${tag}`, emailVerified: new Date() } });
    ownerId = owner.id;
    strangerId = stranger.id;
    const scenario = await prisma.scenario.create({
      data: {
        title: `Limit ${tag}`, description: 'd', userRole: 'u', aiRole: 'a', evaluationCriteria: '{}',
        winCondition: JSON.stringify({ type: 'manual', maxMessages: 30 }),
        joinCode: `L${tag}`.slice(0, 20), createdById: ownerId,
        roles: { create: [{ name: 'Employee', description: 'LEARNER-SECRET-BRIEF', displayOrder: 1 }, { name: 'Manager', description: 'MANAGER-BRIEF', displayOrder: 2 }] },
        members: { create: { userId: ownerId } },
      },
      include: { roles: true },
    });
    await prisma.scenario.update({ where: { id: scenario.id }, data: { learnerRoleId: scenario.roles.find((r) => r.name === 'Employee')!.id } });
    await prisma.persona.create({ data: { scenarioId: scenario.id, roleId: scenario.roles.find((r) => r.name === 'Manager')!.id, name: 'P', description: 'd', roleType: 'r' } });
    const firstPersona = await prisma.persona.findFirst({ where: { scenarioId: scenario.id } });
    const conversation = await prisma.conversation.create({
      data: { userId: ownerId, personaId: firstPersona!.id, scenarioId: scenario.id, status: 'completed', summary: { create: { winningArguments: '[]' } } },
    });
    conversationId = conversation.id;
  });

  afterAll(async () => {
    await prisma.scenario.deleteMany({ where: { title: `Limit ${tag}` } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, strangerId] } } });
    await prisma.$disconnect();
  });

  const patch = (userId: string, feltReal: unknown) =>
    (mockAuthFn.mockResolvedValue({ user: { id: userId, role: 'user' } }),
    PATCH(new NextRequest(`http://localhost/api/conversations/${conversationId}/summary`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feltReal }) }), { params: Promise.resolve({ id: conversationId }) }));

  it('a stranger cannot answer for someone else: 404, nothing stored', async () => {
    expect((await patch(strangerId, 4)).status).toBe(404);
    expect((await prisma.summary.findUnique({ where: { conversationId } }))?.feltReal).toBeNull();
  });

  it('the owner can answer, and the value is stored', async () => {
    expect((await patch(ownerId, 4)).status).toBe(200);
    expect((await prisma.summary.findUnique({ where: { conversationId } }))?.feltReal).toBe(4);
  });

  it('the default 30-message limit is enforced from the real count, past the 50-row window', async () => {
    const persona = await prisma.persona.findFirst({ where: { scenario: { title: `Limit ${tag}` } } });
    const convo = await prisma.conversation.create({ data: { userId: ownerId, personaId: persona!.id, scenarioId: persona!.scenarioId, status: 'in_progress' } });
    // 30 learner turns interleaved with replies: 61 rows, more than any 50-row window.
    await prisma.message.createMany({
      data: Array.from({ length: 61 }, (_, i) => ({ conversationId: convo.id, role: i % 2 === 0 ? 'assistant' : 'user', content: `m${i}` })),
    });
    mockAuthFn.mockResolvedValue({ user: { id: ownerId, role: 'user' } });
    const res = await sendMessage(
      new NextRequest(`http://localhost/api/conversations/${convo.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'one more' }) }),
      { params: Promise.resolve({ id: convo.id }) }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('limit_reached');
    expect(await prisma.message.count({ where: { conversationId: convo.id } })).toBe(61);
  });

  it('the persona prompt input names the learner side but never carries the learner brief', async () => {
    const persona = await prisma.persona.findFirst({ where: { scenario: { title: `Limit ${tag}` } } });
    const learnerRole = await prisma.role.findFirst({ where: { scenarioId: persona!.scenarioId, name: 'Employee' } });
    // One in-progress conversation per user × persona: retire the limit test's conversation first.
    await prisma.conversation.updateMany({ where: { userId: ownerId, personaId: persona!.id, status: 'in_progress' }, data: { status: 'abandoned' } });
    const convo = await prisma.conversation.create({ data: { userId: ownerId, personaId: persona!.id, scenarioId: persona!.scenarioId, roleId: learnerRole!.id, status: 'in_progress' } });
    mockAuthFn.mockResolvedValue({ user: { id: ownerId, role: 'user' } });
    mockGenerate.mockClear();
    const res = await sendMessage(
      new NextRequest(`http://localhost/api/conversations/${convo.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'hello' }) }),
      { params: Promise.resolve({ id: convo.id }) }
    );
    expect(res.status).toBe(200);
    const [personaArg, , scenarioArg] = mockGenerate.mock.calls[0];
    expect(scenarioArg.learnerRole).toEqual({ name: 'Employee' });
    expect(JSON.stringify([personaArg, scenarioArg])).not.toContain('LEARNER-SECRET-BRIEF');
    expect(JSON.stringify(personaArg)).toContain('MANAGER-BRIEF');
  });
});
