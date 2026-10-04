/**
 * @jest-environment node
 */

/**
 * Real-Postgres test for the AI vs AI run routes: only a member can start a run,
 * the opening line is the counterpart's greeting, turns alternate one per call,
 * only the owner can advance a run, and a two-message scenario ends with the
 * message limit. The model is a scripted FakeProvider. Runs when DATABASE_URL
 * points at Postgres.
 */
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

import { PrismaClient } from '@prisma/client';
import { LLMProviderFactory } from '@/lib/llm/providers/factory';
import { FakeProvider } from '@/lib/llm/providers/fake';
import { POST as startRun } from '../runs/route';
import { POST as takeTurn } from '../runs/[id]/turn/route';

const isPostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '');
const describeIfPostgres = isPostgres ? describe : describe.skip;
const prisma = new PrismaClient();
const tag = `run-${Date.now()}`;

describeIfPostgres('AI vs AI run routes (real database)', () => {
  let ownerId: string; let strangerId: string; let scenarioId: string; let personaId: string;

  beforeAll(async () => {
    LLMProviderFactory.useProviders([new FakeProvider(['{"mood":"neutral","endsWithoutDeal":false,"content":"A reply."}'])]);
    ownerId = (await prisma.user.create({ data: { email: `owner-${tag}@example.com`, username: `owner-${tag}`, emailVerified: new Date() } })).id;
    strangerId = (await prisma.user.create({ data: { email: `stranger-${tag}@example.com`, username: `stranger-${tag}`, emailVerified: new Date() } })).id;
    const scenario = await prisma.scenario.create({
      data: {
        title: `Lease ${tag}`, description: 'd', userRole: 'Tenant', aiRole: 'Landlord', evaluationCriteria: '{}',
        winCondition: JSON.stringify({ type: 'manual', maxMessages: 2 }), joinCode: tag.slice(-12), createdById: ownerId, status: 'published',
      },
    });
    scenarioId = scenario.id;
    personaId = (await prisma.persona.create({ data: { scenarioId, name: 'Lou the Landlord', description: 'd', roleType: 'Landlord', initialGreeting: 'Let us discuss the rent.' } })).id;
  });

  afterAll(async () => {
    LLMProviderFactory.useProviders(null);
    await prisma.scenario.deleteMany({ where: { id: scenarioId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, strangerId] } } });
    await prisma.$disconnect();
  });

  const as = (who: string | null) => mockAuthFn.mockResolvedValue(who ? { user: { id: who, role: 'user' } } : null);
  const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const turn = (runId: string, seenTurns: number) =>
    takeTurn(new Request(`http://localhost/api/runs/${runId}/turn`, json({ seenTurns })), { params: Promise.resolve({ id: runId }) });

  it('signed out is 401; a non-member is 403; nothing is written', async () => {
    as(null);
    expect((await startRun(new Request('http://localhost/api/runs', json({ personaId })))).status).toBe(401);
    as(strangerId);
    expect((await startRun(new Request('http://localhost/api/runs', json({ personaId })))).status).toBe(403);
    expect(await prisma.simulationRun.count({ where: { scenarioId } })).toBe(0);
  });

  it('runs to the message limit with alternating turns, owner only', async () => {
    as(ownerId);
    const res = await startRun(new Request('http://localhost/api/runs', json({ personaId })));
    expect(res.status).toBe(201);
    const { run } = await res.json();

    as(strangerId);
    expect((await turn(run.id, 1)).status).toBe(404);

    as(ownerId);
    let state = { status: 'running', turns: [{ side: 'counterpart', content: 'Let us discuss the rent.' }] };
    while (state.status === 'running' && state.turns.length < 10) {
      const r = await turn(run.id, state.turns.length);
      expect(r.status).toBe(200);
      state = await r.json();
    }
    expect(state.turns.map((t) => t.side)).toEqual(['counterpart', 'learner', 'counterpart', 'learner', 'counterpart']);
    expect(state.turns[0].content).toBe('Let us discuss the rent.');
    expect(state.status).toBe('limit');
    // The scenario has no issues, so the result saved with the run is Unscored.
    const saved = await prisma.simulationRun.findUniqueOrThrow({ where: { id: run.id }, select: { result: true } });
    expect(saved.result).toBe('unscored');

    // A stale caller gets the current state and no extra turn is written.
    const stale = await (await turn(run.id, 1)).json();
    expect(stale.turns).toHaveLength(5);
  });
});
