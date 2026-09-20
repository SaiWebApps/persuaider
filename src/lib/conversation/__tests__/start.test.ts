/**
 * @jest-environment node
 */

const db = {
  persona: { findUnique: jest.fn() },
  scenario: { findUnique: jest.fn() },
  userScenario: { findUnique: jest.fn() },
  conversation: { findFirst: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
  message: { create: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
};
jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return db;
  },
}));

import { startOrResumeConversation, assertCanPractice, defaultGreeting } from '../start';
import { AuthorizationError, NotFoundError } from '@/types';

const persona = { id: 'p1', name: 'Alex', initialGreeting: 'Hi there', scenarioId: 's1' };
const hydrated = { id: 'c1', messages: [{ id: 'm1' }], persona, scenario: { id: 's1' } };

beforeEach(() => {
  jest.clearAllMocks();
  db.persona.findUnique.mockResolvedValue(persona);
  db.scenario.findUnique.mockResolvedValue({ createdById: 'creator' });
  db.userScenario.findUnique.mockResolvedValue({ id: 'ms1' });
  db.conversation.findFirst.mockResolvedValue(null);
  db.conversation.create.mockResolvedValue({ id: 'c1' });
  db.conversation.findUniqueOrThrow.mockResolvedValue(hydrated);
});

describe('assertCanPractice', () => {
  it('allows a member', async () => {
    await expect(assertCanPractice('u1', 'user', 's1')).resolves.toBeUndefined();
  });

  it('allows the scenario creator without a membership row', async () => {
    db.userScenario.findUnique.mockResolvedValue(null);
    await expect(assertCanPractice('creator', 'user', 's1')).resolves.toBeUndefined();
  });

  it('allows an admin without touching the database', async () => {
    await expect(assertCanPractice('anyone', 'admin', 's1')).resolves.toBeUndefined();
    expect(db.scenario.findUnique).not.toHaveBeenCalled();
  });

  it('forbids a signed-in learner who never joined', async () => {
    db.userScenario.findUnique.mockResolvedValue(null);
    await expect(assertCanPractice('stranger', 'user', 's1')).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('reports a missing scenario as not found', async () => {
    db.scenario.findUnique.mockResolvedValue(null);
    await expect(assertCanPractice('u1', 'user', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('startOrResumeConversation', () => {
  it('throws NotFoundError for an unknown persona', async () => {
    db.persona.findUnique.mockResolvedValue(null);
    await expect(startOrResumeConversation({ userId: 'u1', role: 'user', personaId: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when the persona is not in the named scenario', async () => {
    await expect(
      startOrResumeConversation({ userId: 'u1', role: 'user', personaId: 'p1', scenarioId: 'other' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('checks access before creating anything', async () => {
    db.userScenario.findUnique.mockResolvedValue(null);
    await expect(startOrResumeConversation({ userId: 'stranger', role: 'user', personaId: 'p1' })).rejects.toBeInstanceOf(
      AuthorizationError
    );
    expect(db.conversation.create).not.toHaveBeenCalled();
    expect(db.message.create).not.toHaveBeenCalled();
  });

  it('resumes an in-progress conversation instead of creating a second one', async () => {
    db.conversation.findFirst.mockResolvedValue(hydrated);
    const result = await startOrResumeConversation({ userId: 'u1', role: 'user', personaId: 'p1' });
    expect(result).toEqual({ conversation: hydrated, created: false });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('creates the conversation and the greeting together, in a transaction', async () => {
    const result = await startOrResumeConversation({ userId: 'u1', role: 'user', personaId: 'p1' });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'u1', personaId: 'p1', scenarioId: 's1', status: 'in_progress' } })
    );
    expect(db.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { conversationId: 'c1', role: 'assistant', content: 'Hi there', mood: 'neutral' },
      })
    );
    expect(result).toEqual({ conversation: hydrated, created: true });
  });

  it('falls back to the default greeting', async () => {
    db.persona.findUnique.mockResolvedValue({ ...persona, initialGreeting: null });
    await startOrResumeConversation({ userId: 'u1', role: 'user', personaId: 'p1' });
    expect(db.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content: defaultGreeting('Alex') }) })
    );
  });
});
