/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/conversations routes.
 * These test the route handlers with mocked dependencies (prisma, auth).
 */
import { NextRequest } from 'next/server';

// Mock auth — use jest.fn() inside the factory so hoisting works
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

// Mock prisma — define inside factory and expose via getter
const mockConversation = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
};
const mockPersona = {
  findUnique: jest.fn(),
};
const mockMessage = {
  create: jest.fn(),
};
const mockUserDb = {
  findUnique: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      conversation: mockConversation,
      persona: mockPersona,
      message: mockMessage,
      user: mockUserDb,
    };
  },
}));

import { GET, POST } from '../conversations/route';

function createRequest(body?: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/conversations', {
    method: body ? 'POST' : 'GET',
    ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}

describe('GET /api/conversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns conversations for authenticated user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const conversations = [
      { id: 'c1', userId: 'user-1', status: 'in_progress', persona: { id: 'p1', name: 'Alex' } },
    ];
    mockConversation.findMany.mockResolvedValue(conversations);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversations).toEqual(conversations);
  });

  it('queries conversations filtered by userId', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findMany.mockResolvedValue([]);

    await GET();
    expect(mockConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
      })
    );
  });
});

describe('POST /api/conversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const request = createRequest({ personaId: 'p1', scenarioId: 's1' });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 when personaId is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const request = createRequest({ scenarioId: 's1' });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 when scenarioId is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const request = createRequest({ personaId: 'p1' });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 404 when persona not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockPersona.findUnique.mockResolvedValue(null);
    const request = createRequest({ personaId: 'p1', scenarioId: 's1' });
    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it('returns 404 when persona does not belong to scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockPersona.findUnique.mockResolvedValue({ id: 'p1', scenarioId: 'other-scenario' });
    const request = createRequest({ personaId: 'p1', scenarioId: 's1' });
    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it('returns existing in-progress conversation if one exists', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockPersona.findUnique.mockResolvedValue({
      id: 'p1',
      scenarioId: 's1',
      initialGreeting: 'Hello',
    });
    const existingConv = { id: 'c-existing', status: 'in_progress' };
    mockConversation.findFirst.mockResolvedValue(existingConv);
    const fullConv = { ...existingConv, persona: { id: 'p1' }, messages: [] };
    mockConversation.findUnique.mockResolvedValue(fullConv);

    const request = createRequest({ personaId: 'p1', scenarioId: 's1' });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversation.id).toBe('c-existing');
    expect(mockConversation.create).not.toHaveBeenCalled();
  });

  it('creates new conversation with greeting message', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockPersona.findUnique.mockResolvedValue({
      id: 'p1',
      scenarioId: 's1',
      name: 'Alex',
      initialGreeting: 'Welcome to the negotiation.',
    });
    mockConversation.findFirst.mockResolvedValue(null);
    const newConv = {
      id: 'c-new',
      userId: 'user-1',
      personaId: 'p1',
      scenarioId: 's1',
      status: 'in_progress',
      persona: { id: 'p1', name: 'Alex' },
      messages: [],
    };
    mockConversation.create.mockResolvedValue(newConv);
    const greetingMsg = {
      id: 'm1',
      conversationId: 'c-new',
      role: 'assistant',
      content: 'Welcome to the negotiation.',
    };
    mockMessage.create.mockResolvedValue(greetingMsg);

    const request = createRequest({ personaId: 'p1', scenarioId: 's1' });
    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversation.messages).toEqual([greetingMsg]);
  });

  it('uses default greeting when persona has no initialGreeting', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockPersona.findUnique.mockResolvedValue({
      id: 'p1',
      scenarioId: 's1',
      name: 'Alex',
      initialGreeting: null,
    });
    mockConversation.findFirst.mockResolvedValue(null);
    mockConversation.create.mockResolvedValue({
      id: 'c-new',
      persona: { id: 'p1' },
      messages: [],
    });
    mockMessage.create.mockResolvedValue({ id: 'm1', content: "Hello, I'm Alex. Let's discuss." });

    const request = createRequest({ personaId: 'p1', scenarioId: 's1' });
    await POST(request);

    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "Hello, I'm Alex. Let's discuss.",
          role: 'assistant',
        }),
      })
    );
  });
});
