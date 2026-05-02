/**
 * @jest-environment node
 */

/**
 * Tests for /api/conversations/[id]/messages/stream route (POST).
 * Tests the SSE streaming endpoint's validation and auth logic.
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockConversation = {
  findUnique: jest.fn(),
};
const mockMessage = {
  create: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      conversation: mockConversation,
      message: mockMessage,
    };
  },
}));

const mockGetProviderChain = jest.fn();
jest.mock('@/lib/llm/providers/factory', () => ({
  LLMProviderFactory: {
    getProviderChain: () => mockGetProviderChain(),
  },
}));

jest.mock('@/lib/llm/prompts', () => ({
  buildConversationContext: jest.fn().mockReturnValue([
    { role: 'system', content: 'You are a persona.' },
    { role: 'user', content: 'hello' },
  ]),
}));

jest.mock('@/lib/llm/mood', () => ({
  parseMoodResponse: (raw: string) => ({ content: raw, mood: 'neutral' }),
}));

jest.mock('@/types', () => ({
  DEFAULT_MOOD: 'neutral',
}));

import { NextRequest } from 'next/server';
import { POST } from '../conversations/[id]/messages/stream/route';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/conversations/c1/messages/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: 'u1',
    status: 'in_progress',
    persona: {
      name: 'Alex',
      description: 'Negotiator',
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

describe('POST /api/conversations/[id]/messages/stream', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when content is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const req = createRequest({});
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is whitespace only', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const req = createRequest({ content: '   ' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is not a string', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const req = createRequest({ content: 42 });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when conversation not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(null);
    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
  });

  it('returns 403 when conversation belongs to another user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation({ userId: 'other' }));
    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 when conversation is not active', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation({ status: 'completed' }));
    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));
    expect(res.status).toBe(400);
  });

  it('returns SSE stream response with correct headers for valid request', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());
    mockMessage.create.mockResolvedValue({ id: 'm1', role: 'user', content: 'hello' });

    // Mock a non-streaming chain (fallback path)
    mockGetProviderChain.mockReturnValue({
      providers: [],
      generateResponse: jest.fn().mockResolvedValue({ content: 'AI response' }),
    });

    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('Connection')).toBe('keep-alive');
  });

  it('creates user message before starting stream', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());
    mockMessage.create.mockResolvedValue({ id: 'm1' });

    mockGetProviderChain.mockReturnValue({
      providers: [],
      generateResponse: jest.fn().mockResolvedValue({ content: 'response' }),
    });

    const req = createRequest({ content: '  test message  ' });
    await POST(req, createParams('c1'));

    expect(mockMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'c1',
          role: 'user',
          content: 'test message',
        }),
      })
    );
  });

  it('reads stream and gets SSE events with non-streaming fallback', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());
    mockMessage.create
      .mockResolvedValueOnce({ id: 'um1' })   // user message
      .mockResolvedValueOnce({ id: 'am1' });   // assistant message

    mockGetProviderChain.mockReturnValue({
      providers: [],
      generateResponse: jest.fn().mockResolvedValue({ content: 'AI says hello' }),
    });

    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));

    // Read the full stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }

    // Should contain chunk and done events
    expect(fullText).toContain('data: ');
    expect(fullText).toContain('"type":"chunk"');
    expect(fullText).toContain('"type":"done"');
  });

  it('uses streaming provider when available', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockConversation.findUnique.mockResolvedValue(makeConversation());
    mockMessage.create
      .mockResolvedValueOnce({ id: 'um1' })
      .mockResolvedValueOnce({ id: 'am1' });

    // Mock a streaming provider
    async function* fakeStream() {
      yield 'Hello ';
      yield 'world!';
    }

    mockGetProviderChain.mockReturnValue({
      providers: [{
        generateStreamingResponse: jest.fn().mockReturnValue(fakeStream()),
      }],
    });

    const req = createRequest({ content: 'hello' });
    const res = await POST(req, createParams('c1'));

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }

    expect(fullText).toContain('"type":"chunk"');
    expect(fullText).toContain('"type":"done"');
  });
});
