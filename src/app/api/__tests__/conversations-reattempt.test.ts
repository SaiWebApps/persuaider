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

import { POST } from '../conversations/[id]/reattempt/route';

function createRequest(): Request {
  return new Request('http://localhost:3000/api/conversations/conv-1/reattempt', {
    method: 'POST',
  });
}

function createContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/conversations/[id]/reattempt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 403 when email not verified', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: null });
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Email not verified');
  });

  it('returns 404 when conversation does not exist', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(null);
    const response = await POST(createRequest(), createContext('nonexistent'));
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Conversation not found');
  });

  it('returns 403 when conversation belongs to another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-2',
      personaId: 'p1',
      scenarioId: 's1',
      status: 'completed',
    });
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('returns 400 when conversation is not completed', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      personaId: 'p1',
      scenarioId: 's1',
      status: 'in_progress',
    });
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Conversation is not completed');
  });

  it('returns 404 when persona has been deleted', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      personaId: 'p1',
      scenarioId: 's1',
      status: 'completed',
    });
    mockPersona.findUnique.mockResolvedValue(null);
    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Persona not found');
  });

  it('returns 201 with new conversation on valid reattempt', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      personaId: 'p1',
      scenarioId: 's1',
      status: 'completed',
    });
    mockPersona.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Alex',
      initialGreeting: 'Welcome back!',
    });
    mockConversation.findFirst.mockResolvedValue(null);
    mockConversation.create.mockResolvedValue({ id: 'conv-new' });
    mockMessage.create.mockResolvedValue({ id: 'm1', content: 'Welcome back!' });

    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.conversationId).toBe('conv-new');
    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-new',
          role: 'assistant',
          content: 'Welcome back!',
        }),
      })
    );
  });

  it('returns 200 with existing in-progress conversation (idempotency)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      personaId: 'p1',
      scenarioId: 's1',
      status: 'completed',
    });
    mockPersona.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Alex',
      initialGreeting: 'Hello',
    });
    mockConversation.findFirst.mockResolvedValue({ id: 'conv-existing' });

    const response = await POST(createRequest(), createContext('conv-1'));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversationId).toBe('conv-existing');
    expect(mockConversation.create).not.toHaveBeenCalled();
  });

  it('uses default greeting when persona has no initialGreeting', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      personaId: 'p1',
      scenarioId: 's1',
      status: 'completed',
    });
    mockPersona.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Alex',
      initialGreeting: null,
    });
    mockConversation.findFirst.mockResolvedValue(null);
    mockConversation.create.mockResolvedValue({ id: 'conv-new' });
    mockMessage.create.mockResolvedValue({ id: 'm1' });

    await POST(createRequest(), createContext('conv-1'));

    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "Hello, I'm Alex. Let's discuss.",
        }),
      })
    );
  });

  it('rapid double reattempt returns same conversation (idempotent)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      personaId: 'p1',
      scenarioId: 's1',
      status: 'completed',
    });
    mockPersona.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Alex',
      initialGreeting: 'Hi',
    });

    // First call: no existing -> creates new
    mockConversation.findFirst.mockResolvedValueOnce(null);
    mockConversation.create.mockResolvedValue({ id: 'conv-new' });
    mockMessage.create.mockResolvedValue({ id: 'm1' });

    const response1 = await POST(createRequest(), createContext('conv-1'));
    expect(response1.status).toBe(201);
    const data1 = await response1.json();

    // Second call: existing in-progress found
    mockConversation.findFirst.mockResolvedValueOnce({ id: 'conv-new' });

    const response2 = await POST(createRequest(), createContext('conv-1'));
    expect(response2.status).toBe(200);
    const data2 = await response2.json();
    expect(data2.conversationId).toBe(data1.conversationId);
  });
});
