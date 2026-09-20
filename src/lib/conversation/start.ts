import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { AuthorizationError, NotFoundError } from '@/types';

/**
 * Starting (or resuming) a practice Conversation has exactly one home.
 *
 * Callers: the chat page, POST /api/conversations, and the reattempt route.
 * Rules enforced here and nowhere else:
 *  - the Persona must exist (and match the Scenario if the caller names one);
 *  - the Learner may practice only in a Scenario they joined, created, or
 *    administer;
 *  - one in-progress Conversation per Learner × Persona: resume it if present;
 *  - a new Conversation and its greeting Message are written in one transaction.
 */

export const conversationInclude = {
  persona: {
    select: {
      id: true,
      name: true,
      description: true,
      roleType: true,
      characteristics: true,
      scenarioId: true,
    },
  },
  scenario: {
    select: { id: true, title: true, userRole: true, aiRole: true, winCondition: true },
  },
  /** The learner's side, with its confidential brief. */
  role: { select: { id: true, name: true, description: true } },
  messages: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ConversationInclude;

export type StartedConversation = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

export interface StartConversationInput {
  userId: string;
  role: string;
  personaId: string;
  /** Optional cross-check: if given, the persona must belong to this scenario. */
  scenarioId?: string;
  /** The side the learner plays. Defaults to the scenario role the persona does not play. */
  roleId?: string;
}

export interface StartConversationResult {
  conversation: StartedConversation;
  created: boolean;
}

export function defaultGreeting(personaName: string): string {
  return `Hello, I'm ${personaName}. Let's discuss.`;
}

/**
 * Throws AuthorizationError unless the user joined the scenario, created it,
 * or is an admin.
 */
export async function assertCanPractice(userId: string, role: string, scenarioId: string): Promise<void> {
  if (role === 'admin') return;
  const scenario = await prisma.scenario.findUnique({
    where: { id: scenarioId },
    select: { createdById: true },
  });
  if (!scenario) throw new NotFoundError('Scenario', scenarioId);
  if (scenario.createdById === userId) return;
  const membership = await prisma.userScenario.findUnique({
    where: { userId_scenarioId: { userId, scenarioId } },
    select: { id: true },
  });
  if (!membership) {
    throw new AuthorizationError('Join this scenario before practicing with its personas');
  }
}

export async function startOrResumeConversation(input: StartConversationInput): Promise<StartConversationResult> {
  const { userId, role, personaId, scenarioId } = input;

  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
    select: { id: true, name: true, initialGreeting: true, scenarioId: true, roleId: true },
  });
  if (!persona || (scenarioId && persona.scenarioId !== scenarioId)) {
    throw new NotFoundError('Persona', personaId);
  }

  await assertCanPractice(userId, role, persona.scenarioId);

  const learnerRoleId = await resolveLearnerRole(persona.scenarioId, persona.roleId, input.roleId);

  const findInProgress = () =>
    prisma.conversation.findFirst({
      where: { userId, personaId, scenarioId: persona.scenarioId, status: 'in_progress' },
      include: conversationInclude,
      orderBy: { startedAt: 'desc' },
    });

  const existing = await findInProgress();
  if (existing) return { conversation: existing, created: false };

  const resolvedPersona = persona;
  let conversation: StartedConversation;
  try {
    conversation = await createWithGreeting();
  } catch (error) {
    // The partial unique index (one in-progress conversation per user × persona)
    // rejected a concurrent create; the other request won, so resume it.
    if ((error as { code?: string })?.code === 'P2002') {
      const raced = await findInProgress();
      if (raced) return { conversation: raced, created: false };
    }
    throw error;
  }

  return { conversation, created: true };

  async function createWithGreeting(): Promise<StartedConversation> {
    return prisma.$transaction(async (tx) => {
    const created = await tx.conversation.create({
      data: { userId, personaId, scenarioId: resolvedPersona.scenarioId, roleId: learnerRoleId, status: 'in_progress' },
      select: { id: true },
    });
    await tx.message.create({
      data: {
        conversationId: created.id,
        role: 'assistant',
        content: resolvedPersona.initialGreeting || defaultGreeting(resolvedPersona.name),
        mood: 'neutral',
      },
    });
    return tx.conversation.findUniqueOrThrow({
      where: { id: created.id },
      include: conversationInclude,
    });
    });
  }
}

/**
 * Which side does the learner play? An explicit choice must be one of the scenario's
 * roles and not the persona's own side. Otherwise: the first scenario role the persona
 * does not play; null when the scenario defines no roles.
 */
export async function resolveLearnerRole(scenarioId: string, personaRoleId: string | null, requested?: string): Promise<string | null> {
  const roles = await prisma.role.findMany({ where: { scenarioId }, orderBy: { displayOrder: 'asc' }, select: { id: true } });
  if (roles.length === 0) return null;
  if (requested) {
    const ok = roles.some((r) => r.id === requested) && requested !== personaRoleId;
    if (!ok) throw new NotFoundError('Role', requested);
    return requested;
  }
  return roles.find((r) => r.id !== personaRoleId)?.id ?? null;
}
