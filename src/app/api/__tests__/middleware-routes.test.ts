/**
 * @jest-environment node
 */

/**
 * Integration tests for route protection at the API handler level.
 * Verifies that auth/admin checks in actual route handlers work correctly
 * when called with missing, invalid, or insufficient auth.
 */

// Budget metering is tested in src/lib/llm/__tests__/usage.test.ts; routes get a permissive fake.
jest.mock('@/lib/llm/usage', () => ({
  assertWithinBudget: jest.fn().mockResolvedValue({ spentUsd: 0, calls: 0, budgetUsd: 2 }),
  recordLlmCall: jest.fn().mockResolvedValue(undefined),
  getDailyUsage: jest.fn().mockResolvedValue({ spentUsd: 0, calls: 0, budgetUsd: 2 }),
  estimatedResponse: (_m: unknown, content: string, provider: string, model: string) => ({
    content, provider, model, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  }),
}));


const mockRequireAdmin = jest.fn();
jest.mock('@/lib/auth/admin', () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockUser = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
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
  count: jest.fn().mockResolvedValue(0),
};
const mockScenario = {
  findMany: jest.fn(),
  create: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      user: mockUser,
      conversation: mockConversation,
      persona: mockPersona,
      message: mockMessage,
      scenario: mockScenario,
    };
  },
}));

jest.mock('@/lib/llm', () => ({
  generatePersonaResponse: jest.fn().mockResolvedValue({ content: 'mock' }),
}));

jest.mock('@/lib/llm/mood', () => ({
  parseMoodResponse: (raw: string) => ({ content: raw, mood: 'neutral' }),
}));

jest.mock('@/types', () => ({
  DEFAULT_MOOD: 'neutral',
}));

jest.mock('crypto', () => ({
  randomBytes: () => ({ toString: () => 'ABCD1234' }),
}));

import { GET as adminScenariosGET } from '../admin/scenarios/route';
import { GET as adminUsersGET } from '../admin/users/route';
import { GET as conversationsGET, POST as conversationsPOST } from '../conversations/route';
import { POST as messagesPOST } from '../conversations/[id]/messages/route';
import { POST as scenariosPOST } from '../scenarios/route';
import { NextRequest, NextResponse } from 'next/server';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(
  url: string,
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// Admin route protection: /api/admin/* without admin role
// ---------------------------------------------------------------------------
describe('Admin route protection (/api/admin/*)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /api/admin/scenarios returns 401 without authentication', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await adminScenariosGET();
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('GET /api/admin/scenarios returns 403 for non-admin user', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const response = await adminScenariosGET();
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('GET /api/admin/users returns 401 without authentication', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const response = await adminUsersGET();
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('GET /api/admin/users returns 403 for non-admin user', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const response = await adminUsersGET();
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('GET /api/admin/scenarios returns data for admin user', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findMany.mockResolvedValue([
      { id: 's1', title: 'Test Scenario', _count: { personas: 2, members: 5, conversations: 10 } },
    ]);

    const response = await adminScenariosGET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.scenarios).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Protected routes without auth: /api/conversations
// ---------------------------------------------------------------------------
describe('Protected routes without auth (/api/conversations)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /api/conversations returns 401 without auth', async () => {
    mockAuthFn.mockResolvedValue(null);

    const response = await conversationsGET();
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('POST /api/conversations returns 401 without auth', async () => {
    mockAuthFn.mockResolvedValue(null);

    const req = createRequest(
      'http://localhost/api/conversations',
      'POST',
      { personaId: 'p1', scenarioId: 's1' }
    );
    const response = await conversationsPOST(req);
    expect(response.status).toBe(401);
  });

  it('GET /api/conversations returns 200 for authenticated verified user', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
    mockConversation.findMany.mockResolvedValue([]);

    const response = await conversationsGET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/scenarios/generate without auth
// ---------------------------------------------------------------------------
describe('Scenario creation without auth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/scenarios returns 401 without auth', async () => {
    mockAuthFn.mockResolvedValue(null);

    const req = createRequest(
      'http://localhost/api/scenarios',
      'POST',
      { title: 'Test', description: 'Test desc', userRole: 'Manager', aiRole: 'VP' }
    );
    const response = await scenariosPOST(req);
    expect(response.status).toBe(401);
  });

  it('POST /api/scenarios returns 403 without email verification', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'unverified-user' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: null });

    const req = createRequest(
      'http://localhost/api/scenarios',
      'POST',
      { title: 'Test', description: 'Test desc', userRole: 'Manager', aiRole: 'VP' }
    );
    const response = await scenariosPOST(req);
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/not verified/i);
  });
});

// ---------------------------------------------------------------------------
// POST /api/conversations/[id]/messages without email verification
// ---------------------------------------------------------------------------
describe('Messages route without email verification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/conversations/[id]/messages returns 401 without auth', async () => {
    mockAuthFn.mockResolvedValue(null);

    const req = createRequest(
      'http://localhost/api/conversations/conv-1/messages',
      'POST',
      { content: 'hello' }
    );
    const response = await messagesPOST(req, createParams('conv-1'));
    expect(response.status).toBe(401);
  });

  it('POST /api/conversations/[id]/messages returns 403 without email verification', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-unverified' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: null });

    const req = createRequest(
      'http://localhost/api/conversations/conv-1/messages',
      'POST',
      { content: 'hello' }
    );
    const response = await messagesPOST(req, createParams('conv-1'));
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/not verified/i);
  });

  it('POST /api/conversations/[id]/messages returns 403 when user record not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'deleted-user' } });
    mockUser.findUnique.mockResolvedValue(null);

    const req = createRequest(
      'http://localhost/api/conversations/conv-1/messages',
      'POST',
      { content: 'hello' }
    );
    const response = await messagesPOST(req, createParams('conv-1'));
    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Adversarial inputs to route handlers
// ---------------------------------------------------------------------------
describe('Adversarial inputs to route handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('handles XSS payload in message content', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      status: 'in_progress',
      persona: { name: 'Alex', description: 'desc', roleType: 'Skeptic', characteristics: null },
      scenario: { title: 'S', description: 'd', userRole: 'U', aiRole: 'A', evaluationCriteria: '{}' },
      messages: [],
    });
    mockMessage.create
      .mockResolvedValueOnce({ id: 'm1', role: 'user', content: '<script>alert(1)</script>' })
      .mockResolvedValueOnce({ id: 'm2', role: 'assistant', content: 'mock', mood: 'neutral' });

    const req = createRequest(
      'http://localhost/api/conversations/conv-1/messages',
      'POST',
      { content: '<script>alert("xss")</script>' }
    );
    const response = await messagesPOST(req, createParams('conv-1'));

    // Should not crash - XSS prevention is a rendering concern
    expect(response.status).toBe(200);
  });

  it('handles extremely long conversation ID', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue(null);

    const longId = 'x'.repeat(10000);
    const req = createRequest(
      `http://localhost/api/conversations/${longId}/messages`,
      'POST',
      { content: 'hello' }
    );
    const response = await messagesPOST(req, createParams(longId));

    // Should return 404, not crash
    expect(response.status).toBe(404);
  });

  it('handles null body gracefully', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      status: 'in_progress',
      persona: { name: 'A', description: 'd', roleType: 'R', characteristics: null },
      scenario: { title: 'S', description: 'd', userRole: 'U', aiRole: 'A', evaluationCriteria: '{}' },
      messages: [],
    });

    // Send request with invalid JSON-ish content
    const req = new NextRequest(
      'http://localhost/api/conversations/conv-1/messages',
      {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      }
    );
    const response = await messagesPOST(req, createParams('conv-1'));

    // Missing content field -> 400
    expect(response.status).toBe(400);
  });

  it('handles message content that exceeds max length', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      status: 'in_progress',
      persona: { name: 'A', description: 'd', roleType: 'R', characteristics: null },
      scenario: { title: 'S', description: 'd', userRole: 'U', aiRole: 'A', evaluationCriteria: '{}' },
      messages: [],
    });

    const longContent = 'A'.repeat(2001);
    const req = createRequest(
      'http://localhost/api/conversations/conv-1/messages',
      'POST',
      { content: longContent }
    );
    const response = await messagesPOST(req, createParams('conv-1'));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/too long/i);
  });

  it('rejects numeric content type', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });

    const req = createRequest(
      'http://localhost/api/conversations/conv-1/messages',
      'POST',
      { content: 42 as unknown as string }
    );
    const response = await messagesPOST(req, createParams('conv-1'));

    expect(response.status).toBe(400);
  });
});
