/**
 * @jest-environment node
 */

/**
 * Real-Postgres integration test for starting a conversation: membership is
 * enforced against real rows, and the partial unique index guarantees one
 * in-progress conversation per user × persona even under concurrent starts.
 * Runs when DATABASE_URL points at Postgres (CI always; locally via Docker).
 */
import { PrismaClient } from '@prisma/client';
import { startOrResumeConversation, assertCanPractice } from '../start';
import { AuthorizationError } from '@/types';

const isPostgres = /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? '');
const describeIfPostgres = isPostgres ? describe : describe.skip;

const prisma = new PrismaClient();
const tag = `it-${Date.now()}`;

describeIfPostgres('startOrResumeConversation (real database)', () => {
  let memberId: string;
  let strangerId: string;
  let creatorId: string;
  let personaId: string;
  let scenarioId: string;

  beforeAll(async () => {
    const [member, stranger, creator] = await Promise.all(
      ['member', 'stranger', 'creator'].map((n) =>
        prisma.user.create({ data: { email: `${n}-${tag}@example.com`, username: `${n}-${tag}` } })
      )
    );
    memberId = member.id;
    strangerId = stranger.id;
    creatorId = creator.id;
    const scenario = await prisma.scenario.create({
      data: {
        title: `Scenario ${tag}`,
        description: 'd',
        userRole: 'u',
        aiRole: 'a',
        evaluationCriteria: '{}',
        winCondition: '{}',
        joinCode: `J${tag}`.slice(0, 20),
        createdById: creatorId,
        roles: { create: [{ name: 'Employee', description: 'secret A', displayOrder: 1 }, { name: 'Manager', description: 'secret B', displayOrder: 2 }] },
        members: { create: { userId: memberId } },
      },
      include: { roles: true },
    });
    scenarioId = scenario.id;
    const managerRole = scenario.roles.find((r) => r.name === 'Manager')!;
    const persona = await prisma.persona.create({ data: { scenarioId, roleId: managerRole.id, name: 'P', description: 'd', roleType: 'r', initialGreeting: 'Hi' } });
    personaId = persona.id;
  });

  afterAll(async () => {
    await prisma.scenario.deleteMany({ where: { id: scenarioId } });
    await prisma.user.deleteMany({ where: { id: { in: [memberId, strangerId, creatorId] } } });
    await prisma.$disconnect();
  });

  it('lets a member, the creator and an admin practice; refuses a stranger', async () => {
    await expect(assertCanPractice(memberId, 'user', scenarioId)).resolves.toBeUndefined();
    await expect(assertCanPractice(creatorId, 'user', scenarioId)).resolves.toBeUndefined();
    await expect(assertCanPractice(strangerId, 'admin', scenarioId)).resolves.toBeUndefined();
    await expect(assertCanPractice(strangerId, 'user', scenarioId)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('creates once with a greeting, then resumes; concurrent starts share one conversation', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => startOrResumeConversation({ userId: memberId, role: 'user', personaId }))
    );
    const ids = new Set(results.map((r) => r.conversation.id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);

    const inProgress = await prisma.conversation.count({ where: { userId: memberId, personaId, status: 'in_progress' } });
    expect(inProgress).toBe(1);
    const messages = await prisma.message.findMany({ where: { conversationId: [...ids][0] } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'assistant', content: 'Hi', mood: 'neutral' });

    const again = await startOrResumeConversation({ userId: memberId, role: 'user', personaId });
    expect(again.created).toBe(false);
    expect(again.conversation.id).toBe([...ids][0]);
    // The learner plays the side the persona does not: Employee, with its brief attached.
    expect(again.conversation.role).toMatchObject({ name: 'Employee', description: 'secret A' });
  });

  it('the database itself refuses a second in-progress conversation for the same user and persona', async () => {
    await expect(
      prisma.conversation.create({ data: { userId: memberId, personaId, scenarioId, status: 'in_progress' } })
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
