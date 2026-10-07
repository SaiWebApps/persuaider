/**
 * @jest-environment node
 */

/**
 * Real-Postgres test for the scripted AI stand-in: POST /api/scripted-ai is for signed-in
 * callers in an acceptance run only, and once a script is sent every run plays it from its
 * first line, ends at the message limit with no deal, and gets the scripted feedback.
 * Runs when DATABASE_URL points at Postgres.
 */
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

import { PrismaClient } from '@prisma/client';
import { setAiScript } from '@/lib/llm/providers/scripted';
import { pointText, readRunFeedback } from '@/lib/run/feedback';
import { POST as sendScript } from '../scripted-ai/route';
import { POST as startRun } from '../runs/route';
import { POST as takeTurn } from '../runs/[id]/turn/route';

const isPostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '');
const describeIfPostgres = isPostgres ? describe : describe.skip;
const prisma = new PrismaClient();
const tag = `scripted-${Date.now()}`;

const script = {
  turns: ['I would like an affordable lease.', 'I need to protect the building value.', 'Let us keep discussing the monthly rent.'],
  feedback: {
    wentWell: ['Saying "an affordable lease" kept Monthly rent below their target $1,900 in view.'],
    goneBetter: ['Saying "keep discussing the monthly rent" left their Monthly rent walk-away $1,600 unexplored.'],
  },
};

describeIfPostgres('scripted AI stand-in (real database)', () => {
  let ownerId: string; let scenarioId: string; let personaId: string;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `owner-${tag}@example.com`, username: `owner-${tag}`, emailVerified: new Date() } })).id;
    const scenario = await prisma.scenario.create({
      data: {
        title: `Lease ${tag}`, description: 'd', userRole: 'Tenant', aiRole: 'Landlord', evaluationCriteria: '{}',
        winCondition: JSON.stringify({ type: 'manual', maxMessages: 4 }), joinCode: tag.slice(-12), createdById: ownerId, status: 'published',
        issues: JSON.stringify([{ name: 'Monthly rent', unit: 'USD', learnerWants: 'lower', learner: { target: 1500, reservation: 1800, weight: 100 }, counterpart: { target: 1900, reservation: 1600, weight: 100 } }]),
      },
    });
    scenarioId = scenario.id;
    personaId = (await prisma.persona.create({ data: { scenarioId, name: 'Lou the Landlord', description: 'd', roleType: 'Landlord', initialGreeting: 'Let us discuss the rent.' } })).id;
  });

  afterAll(async () => {
    setAiScript(null);
    delete process.env.PEERAXIS_ACCEPTANCE;
    await prisma.scenario.deleteMany({ where: { id: scenarioId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  const as = (who: string | null) => mockAuthFn.mockResolvedValue(who ? { user: { id: who, role: 'user' } } : null);
  const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const send = (body: unknown) => sendScript(new Request('http://localhost/api/scripted-ai', json(body)));

  it('is 401 signed out, 404 outside an acceptance run, 400 for a bad body', async () => {
    as(null);
    expect((await send(script)).status).toBe(401);
    as(ownerId);
    delete process.env.PEERAXIS_ACCEPTANCE;
    expect((await send(script)).status).toBe(404);
    process.env.PEERAXIS_ACCEPTANCE = '1';
    expect((await send({})).status).toBe(400);
    expect((await send({ turns: [1, 2] })).status).toBe(400);
    expect((await send({ turns: 'hi' })).status).toBe(400);
  });

  it('plays every run from the first line to the limit, with the scripted feedback', async () => {
    as(ownerId);
    process.env.PEERAXIS_ACCEPTANCE = '1';
    const saved = await send(script);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual(script);

    const play = async () => {
      const { run } = await (await startRun(new Request('http://localhost/api/runs', json({ personaId })))).json();
      let state = { status: 'running', turns: [{ side: 'counterpart', content: 'Let us discuss the rent.' }] };
      while (state.status === 'running' && state.turns.length < 20) {
        const r = await takeTurn(new Request(`http://localhost/api/runs/${run.id}/turn`, json({ seenTurns: state.turns.length })), { params: Promise.resolve({ id: run.id }) });
        expect(r.status).toBe(200);
        state = await r.json();
      }
      return { id: run.id as string, state };
    };

    const first = await play();
    expect(first.state.status).toBe('limit');
    expect(first.state.turns.map((t) => t.content)).toEqual([
      'Let us discuss the rent.', ...script.turns, ...Array(5).fill('Let us keep discussing the monthly rent.'),
    ]);
    const row = await prisma.simulationRun.findUniqueOrThrow({ where: { id: first.id }, select: { result: true, feedback: true } });
    expect(row.result).toBe('no_deal');
    const feedback = readRunFeedback(row.feedback);
    expect(feedback.wentWell.map(pointText)).toEqual(script.feedback.wentWell);
    expect(feedback.goneBetter.map(pointText)).toEqual(script.feedback.goneBetter);
    expect(feedback.wentWell[0]!.quote).toBe('an affordable lease');

    const second = await play();
    expect(second.state.turns).toEqual(first.state.turns);
  });
});
