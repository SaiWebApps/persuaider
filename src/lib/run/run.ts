import { prisma } from '@/lib/db/client';
import { LLMProviderFactory } from '@/lib/llm';
import { buildPersonaPrompt } from '@/lib/llm/prompts';
import { extractDealState } from '@/lib/llm/deal';
import { assertWithinBudget, recordLlmCall } from '@/lib/llm/usage';
import type { LLMMessage } from '@/lib/llm/types';
import { personaPromptSelect, scenarioPromptSelect } from '@/lib/conversation/context';
import { assertCanPractice, defaultGreeting, resolveLearnerRole } from '@/lib/conversation/start';
import { readIssues, readWinCondition } from '@/lib/codec/scenario';
import { NotFoundError } from '@/types';
import { buildLearnerSidePrompt, RUN_REPLY_INSTRUCTION } from './prompts';
import {
  asChatMessages,
  DEFAULT_RUN_MAX_MESSAGES,
  asMessagesFor,
  nextSide,
  outcomeAfterTurn,
  parseTurnReply,
  readRunResult,
  readRunStatus,
  readTranscript,
  runResult,
  runWinCondition,
  type RunResult,
  type RunStatus,
  type RunTurn,
} from './transcript';

/**
 * An AI vs AI run: the owner picks a counterpart, the model plays both sides.
 * Each call to takeRunTurn adds exactly one turn, so no request waits on more
 * than one reply (plus the deal check after a counterpart reply).
 */

export interface RunState {
  status: RunStatus;
  turns: RunTurn[];
}

/** Starts a run whose opening line is the counterpart's greeting. */
export async function createRun(userId: string, role: string, personaId: string): Promise<{ id: string }> {
  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
    select: { id: true, name: true, initialGreeting: true, scenarioId: true },
  });
  if (!persona) throw new NotFoundError('Persona', personaId);
  await assertCanPractice(userId, role, persona.scenarioId);
  const greeting: RunTurn = { side: 'counterpart', content: persona.initialGreeting || defaultGreeting(persona.name) };
  return prisma.simulationRun.create({
    data: { userId, scenarioId: persona.scenarioId, personaId: persona.id, transcript: JSON.stringify([greeting]) },
    select: { id: true },
  });
}

async function loadRun(runId: string, userId: string) {
  const run = await prisma.simulationRun.findUnique({
    where: { id: runId },
    include: {
      scenario: { select: { ...scenarioPromptSelect, id: true } },
      persona: { select: { ...personaPromptSelect, id: true, roleId: true } },
    },
  });
  if (!run || run.userId !== userId) throw new NotFoundError('Run', runId);
  return run;
}

type LoadedRun = Awaited<ReturnType<typeof loadRun>>;

/** The two sides' names as the page shows them; falls back to the scenario's roles when it defines no sides. */
export async function runSides(run: LoadedRun) {
  const learnerRoleId = await resolveLearnerRole(run.scenario.id, run.persona.roleId);
  const learnerRole = learnerRoleId
    ? await prisma.role.findUnique({ where: { id: learnerRoleId }, select: { name: true, description: true } })
    : null;
  return {
    learner: learnerRole ?? { name: run.scenario.userRole, description: null },
    counterpart: run.persona.role?.name ?? run.scenario.aiRole,
  };
}

export async function getRunView(runId: string, userId: string) {
  const run = await loadRun(runId, userId);
  const sides = await runSides(run);
  return {
    id: run.id,
    scenarioTitle: run.scenario.title,
    personaName: run.persona.name,
    learnerSide: sides.learner.name,
    counterpartSide: sides.counterpart,
    maxMessages: runWinCondition(readWinCondition(run.scenario.winCondition)).maxMessages ?? DEFAULT_RUN_MAX_MESSAGES,
    state: { status: readRunStatus(run.status), turns: readTranscript(run.transcript) } satisfies RunState,
  };
}

/** A finished run's report: its saved result and its turns; null while the run is still going. */
export async function getRunReport(runId: string, userId: string) {
  const run = await loadRun(runId, userId);
  const status = readRunStatus(run.status);
  if (status === 'running') return null;
  const sides = await runSides(run);
  const result: RunResult =
    readRunResult(run.result) ?? runResult(status, readIssues(run.scenario.issues).length > 0);
  return {
    id: run.id,
    scenarioTitle: run.scenario.title,
    learnerSide: sides.learner.name,
    counterpartSide: sides.counterpart,
    result,
    turns: readTranscript(run.transcript),
  };
}

/**
 * Adds the next turn when the caller has seen `seenTurns` turns. If the run moved on
 * meanwhile (another tab, a retried request) or has ended, nothing is generated and
 * the current state comes back, so a turn is never written twice.
 */
export async function takeRunTurn(runId: string, userId: string, seenTurns: number): Promise<RunState> {
  const run = await loadRun(runId, userId);
  const transcript = readTranscript(run.transcript);
  const current: RunState = { status: readRunStatus(run.status), turns: transcript };
  if (current.status !== 'running' || transcript.length !== seenTurns) return current;

  await assertWithinBudget(userId);
  const sides = await runSides(run);
  const side = nextSide(transcript);
  const meter = { userId, purpose: 'run_turn' as const };
  const system =
    side === 'counterpart'
      ? buildPersonaPrompt(run.persona, { ...run.scenario, learnerRole: { name: sides.learner.name } }) + RUN_REPLY_INSTRUCTION
      : buildLearnerSidePrompt({ scenario: run.scenario, side: sides.learner, counterpart: { name: run.persona.name, side: sides.counterpart } });
  const messages: LLMMessage[] = [{ role: 'system', content: system }, ...asMessagesFor(side, transcript)];

  let reply = { content: '', endsWithoutDeal: false };
  for (let attempt = 0; attempt < 2 && !reply.content; attempt++) {
    const response = await LLMProviderFactory.getProviderChain().generateResponse(messages, {});
    await recordLlmCall(meter, response);
    reply = parseTurnReply(response.content);
  }
  if (!reply.content) throw new Error('The model returned an empty turn');

  const turns = [...transcript, { side, content: reply.content }];
  const issues = readIssues(run.scenario.issues);
  const deal =
    side === 'counterpart' && issues.length > 0
      ? await extractDealState(asChatMessages(turns), issues, run.persona.name, { userId, purpose: 'deal' })
      : null;
  const status = outcomeAfterTurn({
    transcript: turns,
    condition: readWinCondition(run.scenario.winCondition),
    endsWithoutDeal: reply.endsWithoutDeal,
    dealReached: deal?.reached ?? false,
  });

  const written = await prisma.simulationRun.updateMany({
    where: { id: run.id, status: 'running', transcript: run.transcript },
    data: {
      transcript: JSON.stringify(turns),
      status,
      result: status === 'running' ? null : runResult(status, issues.length > 0),
    },
  });
  if (written.count === 0) {
    const fresh = await loadRun(runId, userId);
    return { status: readRunStatus(fresh.status), turns: readTranscript(fresh.transcript) };
  }
  return { status, turns };
}
