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


// The start-or-resume rules live in @/lib/conversation/start and are tested there.
// Routes are tested for authorization and for mapping the module's outcomes to HTTP.
const mockStart = jest.fn();
jest.mock('@/lib/conversation/start', () => ({
  startOrResumeConversation: (...args: unknown[]) => mockStart(...args),
}));

import { GET, POST } from '../conversations/route';
import { AuthorizationError, NotFoundError } from '@/types';

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
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const response = await POST(createRequest({ personaId: 'p1', scenarioId: 's1' }));
    expect(response.status).toBe(401);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('returns 400 when personaId or scenarioId is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    expect((await POST(createRequest({ scenarioId: 's1' }))).status).toBe(400);
    expect((await POST(createRequest({ personaId: 'p1' }))).status).toBe(400);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('passes the session user, role, persona and scenario to the module', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockStart.mockResolvedValue({ conversation: { id: 'c1', messages: [] }, created: true });
    const response = await POST(createRequest({ personaId: 'p1', scenarioId: 's1' }));
    expect(response.status).toBe(200);
    expect(mockStart).toHaveBeenCalledWith({ userId: 'user-1', role: 'user', personaId: 'p1', scenarioId: 's1' });
    expect((await response.json()).conversation.id).toBe('c1');
  });

  it('maps NotFoundError to 404', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockStart.mockRejectedValue(new NotFoundError('Persona', 'p1'));
    const response = await POST(createRequest({ personaId: 'p1', scenarioId: 's1' }));
    expect(response.status).toBe(404);
  });

  it('maps AuthorizationError to 403 for a learner who never joined', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'stranger', role: 'user' } });
    mockStart.mockRejectedValue(new AuthorizationError('Join this scenario before practicing with its personas'));
    const response = await POST(createRequest({ personaId: 'p1', scenarioId: 's1' }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain('Join this scenario');
  });

  it('returns 500 on unexpected failure', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockStart.mockRejectedValue(new Error('db down'));
    const response = await POST(createRequest({ personaId: 'p1', scenarioId: 's1' }));
    expect(response.status).toBe(500);
  });
});
