/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockConversation = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
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

import { POST } from '../conversations/[id]/reattempt/route';
import { AuthorizationError } from '@/types';

function createRequest(): Request {
  return new Request('http://localhost:3000/api/conversations/conv-1/reattempt', {
    method: 'POST',
  });
}

function createContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/conversations/[id]/reattempt', () => {
  const owner = { user: { id: 'user-1', role: 'user' } };
  const completed = { id: 'conv-1', userId: 'user-1', personaId: 'p1', scenarioId: 's1', status: 'completed' };

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(401);
  });

  it('returns 404 when the conversation does not exist', async () => {
    mockAuthFn.mockResolvedValue(owner);
    mockConversation.findUnique.mockResolvedValue(null);
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(404);
  });

  it('returns 403 when the conversation belongs to another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'someone-else', role: 'user' } });
    mockConversation.findUnique.mockResolvedValue(completed);
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(403);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('returns 400 when the conversation is not completed', async () => {
    mockAuthFn.mockResolvedValue(owner);
    mockConversation.findUnique.mockResolvedValue({ ...completed, status: 'in_progress' });
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(400);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('returns 201 with the new conversation id', async () => {
    mockAuthFn.mockResolvedValue(owner);
    mockConversation.findUnique.mockResolvedValue(completed);
    mockStart.mockResolvedValue({ conversation: { id: 'conv-2' }, created: true });
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ conversationId: 'conv-2' });
    expect(mockStart).toHaveBeenCalledWith({ userId: 'user-1', role: 'user', personaId: 'p1', scenarioId: 's1' });
  });

  it('returns 200 when an in-progress attempt already exists (idempotent)', async () => {
    mockAuthFn.mockResolvedValue(owner);
    mockConversation.findUnique.mockResolvedValue(completed);
    mockStart.mockResolvedValue({ conversation: { id: 'conv-existing' }, created: false });
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ conversationId: 'conv-existing' });
  });

  it('returns 403 when the user has since lost access to the scenario', async () => {
    mockAuthFn.mockResolvedValue(owner);
    mockConversation.findUnique.mockResolvedValue(completed);
    mockStart.mockRejectedValue(new AuthorizationError('Join this scenario before practicing with its personas'));
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(403);
  });
});
