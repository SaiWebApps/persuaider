/**
 * @jest-environment node
 */

/**
 * Red-team tests for conversation flow: messages, XSS, long content,
 * auth boundary crossing, completed conversations, and context window limits.
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockConversation = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
const mockMessage = {
  create: jest.fn(),
};
const mockPersona = {
  findUnique: jest.fn(),
};
const mockUser = {
  findUnique: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      conversation: mockConversation,
      message: mockMessage,
      persona: mockPersona,
      user: mockUser,
    };
  },
}));

const mockGeneratePersonaResponse = jest.fn();
jest.mock('@/lib/llm', () => ({
  generatePersonaResponse: (...args: unknown[]) =>
    mockGeneratePersonaResponse(...args),
}));

jest.mock('@/lib/llm/mood', () => ({
  parseMoodResponse: (raw: string) => ({ content: raw, mood: 'neutral' }),
}));

jest.mock('@/types', () => ({
  DEFAULT_MOOD: 'neutral',
}));

import { POST as sendMessage } from '../conversations/[id]/messages/route';
import { POST as createConversation } from '../conversations/route';
import { NextRequest } from 'next/server';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function msgRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/conversations/c1/messages', {
    method: 'POST',
    body: JSON.stringify(body || {}),
    headers: { 'Content-Type': 'application/json' },
  });
}

function convRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/conversations', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: 'u1',
    status: 'in_progress',
    persona: {
      name: 'Alex',
      description: 'Tough negotiator',
      roleType: 'Skeptic',
      characteristics: null,
    },
    scenario: {
      title: 'Budget',
      description: 'Budget negotiation',
      userRole: 'Manager',
      aiRole: 'CFO',
      evaluationCriteria: '{}',
    },
    messages: [],
    ...overrides,
  };
}

// =============================================================================
// AUTH BOUNDARY CROSSING
// =============================================================================

describe('Message - Auth Boundary Crossing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 403 when sending message to another user conversation', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'attacker' } });
    mockConversation.findUnique.mockResolvedValue(
      makeConversation({ userId: 'victim' })
    );

    const res = await sendMessage(msgRequest({ content: 'pwned' }), createParams('c1'));
    expect(res.status).toBe(403);
    // No message should be created
    expect(mockMessage.create).not.toHaveBeenCalled();
  });

  it('does not leak conversation data in 403 response', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'attacker' } });
    mockConversation.findUnique.mockResolvedValue(
      makeConversation({ userId: 'victim' })
    );

    const res = await sendMessage(msgRequest({ content: 'hello' }), createParams('c1'));
    const data = await res.json();
    // Should only have error field, not conversation details
    expect(data.error).toBeDefined();
    expect(data.conversation).toBeUndefined();
    expect(data.messages).toBeUndefined();
  });
});

// =============================================================================
// COMPLETED CONVERSATION
// =============================================================================

describe('Message - Completed Conversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 400 when sending message to a completed conversation', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(
      makeConversation({ status: 'completed' })
    );

    const res = await sendMessage(msgRequest({ content: 'one more thing' }), createParams('c1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not active/i);
    expect(mockMessage.create).not.toHaveBeenCalled();
  });

  it('returns 400 when sending message to an abandoned conversation', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(
      makeConversation({ status: 'abandoned' })
    );

    const res = await sendMessage(msgRequest({ content: 'revive' }), createParams('c1'));
    expect(res.status).toBe(400);
    expect(mockMessage.create).not.toHaveBeenCalled();
  });
});

// =============================================================================
// EXTREMELY LONG MESSAGE
// =============================================================================

describe('Message - Extremely Long Content', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('rejects a 10000 character message (server-side length limit enforced)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());

    const longContent = 'A'.repeat(10000);

    const res = await sendMessage(msgRequest({ content: longContent }), createParams('c1'));
    // FIXED: Messages longer than 2000 characters are rejected
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Message too long. Maximum 2000 characters.');
    // No message should be stored
    expect(mockMessage.create).not.toHaveBeenCalled();
  });

  it('route queries DB with take:50, limiting context sent to LLM', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });

    // The DB query uses `take: 50`, so we simulate 50 messages returned
    // (what the DB would return for a 100+ message conversation)
    const fiftyMessages = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'assistant' : 'user',
      content: `Message ${i + 50}`, // messages 50-99 (last 50)
      createdAt: new Date(Date.now() + i * 1000),
    }));

    mockConversation.findUnique.mockResolvedValue(
      makeConversation({ messages: fiftyMessages })
    );

    mockMessage.create
      .mockResolvedValueOnce({ id: 'm1', role: 'user', content: 'new' })
      .mockResolvedValueOnce({ id: 'm2', role: 'assistant', content: 'reply', mood: 'neutral' });
    mockGeneratePersonaResponse.mockResolvedValue({ content: 'reply' });

    await sendMessage(msgRequest({ content: 'new message' }), createParams('c1'));

    // The route builds allMessages from conversation.messages (50) + new user message (1)
    const callArgs = mockGeneratePersonaResponse.mock.calls[0];
    const messagesPassedToLLM = callArgs[1]; // second arg is allMessages
    // 50 existing messages + 1 new = 51
    expect(messagesPassedToLLM.length).toBe(51);

    // Verify the DB query includes take: 50
    expect(mockConversation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          messages: expect.objectContaining({ take: 50 }),
        }),
      })
    );
  });
});

// =============================================================================
// EMPTY AND WHITESPACE MESSAGES
// =============================================================================

describe('Message - Empty and Invalid Content', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 400 for empty string message', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await sendMessage(msgRequest({ content: '' }), createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for whitespace-only message', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await sendMessage(msgRequest({ content: '   \n\t  ' }), createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for null content', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await sendMessage(msgRequest({ content: null }), createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for undefined content (missing field)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await sendMessage(msgRequest({}), createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for numeric content', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await sendMessage(msgRequest({ content: 42 }), createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for array content', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await sendMessage(msgRequest({ content: ['hello'] }), createParams('c1'));
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// XSS IN MESSAGES
// =============================================================================

describe('Message - XSS Payloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('stores XSS payload as-is (no server-side sanitization)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());

    const xssContent = '<script>alert("xss")</script>';
    mockMessage.create
      .mockResolvedValueOnce({ id: 'm1', role: 'user', content: xssContent })
      .mockResolvedValueOnce({ id: 'm2', role: 'assistant', content: 'reply', mood: 'neutral' });
    mockGeneratePersonaResponse.mockResolvedValue({ content: 'reply' });

    const res = await sendMessage(msgRequest({ content: xssContent }), createParams('c1'));
    expect(res.status).toBe(200);

    // Content passes through to DB storage (sanitization is frontend responsibility)
    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: xssContent }),
      })
    );
  });

  it('handles message with HTML entities', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());

    const htmlContent = '&lt;img src=x onerror=alert(1)&gt; I want a raise';
    mockMessage.create
      .mockResolvedValueOnce({ id: 'm1', role: 'user', content: htmlContent })
      .mockResolvedValueOnce({ id: 'm2', role: 'assistant', content: 'ok', mood: 'neutral' });
    mockGeneratePersonaResponse.mockResolvedValue({ content: 'ok' });

    const res = await sendMessage(msgRequest({ content: htmlContent }), createParams('c1'));
    expect(res.status).toBe(200);
  });

  it('handles message with nested script tags', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());

    const nestedXss = '<scr<script>ipt>alert("nested")</scr</script>ipt>';
    mockMessage.create
      .mockResolvedValueOnce({ id: 'm1', role: 'user', content: nestedXss })
      .mockResolvedValueOnce({ id: 'm2', role: 'assistant', content: 'ok', mood: 'neutral' });
    mockGeneratePersonaResponse.mockResolvedValue({ content: 'ok' });

    const res = await sendMessage(msgRequest({ content: nestedXss }), createParams('c1'));
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// CONVERSATION CREATION EDGE CASES
// =============================================================================

describe('Conversation Creation - Red Team', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 400 when personaId is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await createConversation(convRequest({ scenarioId: 's1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when scenarioId is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await createConversation(convRequest({ personaId: 'p1' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when persona does not belong to the scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findUnique.mockResolvedValue({ id: 'p1', scenarioId: 'different-scenario' });

    const res = await createConversation(convRequest({ personaId: 'p1', scenarioId: 's1' }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found in this scenario/i);
  });

  it('returns existing conversation if one is already in-progress', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findUnique.mockResolvedValue({ id: 'p1', scenarioId: 's1' });
    mockConversation.findFirst.mockResolvedValue({ id: 'existing-conv' });
    mockConversation.findUnique.mockResolvedValue({
      id: 'existing-conv',
      persona: { id: 'p1', name: 'Alex', description: 'D', roleType: 'R', characteristics: null },
      messages: [{ id: 'm1', role: 'assistant', content: 'Hi' }],
    });

    const res = await createConversation(convRequest({ personaId: 'p1', scenarioId: 's1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation.id).toBe('existing-conv');
    // Should NOT create a new conversation
    expect(mockConversation.create).not.toHaveBeenCalled();
  });

  it('creates greeting message from persona on new conversation', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findUnique.mockResolvedValue({
      id: 'p1',
      scenarioId: 's1',
      initialGreeting: 'Welcome to the negotiation!',
    });
    mockConversation.findFirst.mockResolvedValue(null);
    mockConversation.create.mockResolvedValue({
      id: 'new-conv',
      persona: { id: 'p1', name: 'Alex', description: 'D', roleType: 'R', characteristics: null },
      messages: [],
    });
    mockMessage.create.mockResolvedValue({
      id: 'greeting-msg',
      role: 'assistant',
      content: 'Welcome to the negotiation!',
    });

    const res = await createConversation(convRequest({ personaId: 'p1', scenarioId: 's1' }));
    expect(res.status).toBe(200);
    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'assistant',
          content: 'Welcome to the negotiation!',
        }),
      })
    );
  });

  it('uses default greeting when persona has no initialGreeting', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findUnique.mockResolvedValue({
      id: 'p1',
      scenarioId: 's1',
      name: 'Bob',
      initialGreeting: null,
    });
    mockConversation.findFirst.mockResolvedValue(null);
    mockConversation.create.mockResolvedValue({
      id: 'new-conv',
      persona: { id: 'p1', name: 'Bob', description: 'D', roleType: 'R', characteristics: null },
      messages: [],
    });
    mockMessage.create.mockResolvedValue({
      id: 'greeting-msg',
      role: 'assistant',
      content: "Hello, I'm Bob. Let's discuss.",
    });

    await createConversation(convRequest({ personaId: 'p1', scenarioId: 's1' }));
    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "Hello, I'm Bob. Let's discuss.",
        }),
      })
    );
  });
});
