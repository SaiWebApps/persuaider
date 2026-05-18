/**
 * @jest-environment node
 */

/**
 * Security tests for Clerk-era authentication patterns.
 * Covers webhook forgery, session manipulation, cross-user access,
 * duplicate prevention, and graceful handling of unexpected data.
 */

const mockVerify = jest.fn();
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({
    verify: mockVerify,
  })),
}));

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockUser = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
const mockConversation = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
};
const mockMessage = {
  create: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      user: mockUser,
      conversation: mockConversation,
      message: mockMessage,
    };
  },
}));

jest.mock('@/lib/llm', () => ({
  generatePersonaResponse: jest.fn().mockResolvedValue({ content: 'mock response' }),
}));

jest.mock('@/lib/llm/mood', () => ({
  parseMoodResponse: (raw: string) => ({ content: raw, mood: 'neutral' }),
}));

jest.mock('@/types', () => ({
  DEFAULT_MOOD: 'neutral',
}));

import { POST as webhookPOST } from '../webhooks/clerk/route';
import { GET as conversationsGET } from '../conversations/route';
import { POST as messagesPOST } from '../conversations/[id]/messages/route';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function createWebhookRequest(
  body: string,
  headers: Record<string, string> = {}
) {
  const defaultHeaders: Record<string, string> = {
    'svix-id': 'msg_test_sec_123',
    'svix-timestamp': '1234567890',
    'svix-signature': 'v1,validSignatureHere',
    'content-type': 'application/json',
    ...headers,
  };
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    headers: defaultHeaders,
    body,
  });
}

function userEvent(type: string, data: Record<string, unknown>) {
  return { type, data };
}

function createMessageRequest(
  conversationId: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest(
    `http://localhost/api/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(body || { content: 'test message' }),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Webhook security tests
// ---------------------------------------------------------------------------
describe('Webhook signature forgery and replay attacks', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CLERK_WEBHOOK_SECRET: 'whsec_sec_test' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects forged signature (invalid svix signature)', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const body = JSON.stringify(
      userEvent('user.created', {
        id: 'user_forged',
        email_addresses: [{ email_address: 'attacker@evil.com', id: 'ea_1' }],
        first_name: 'Attacker',
        last_name: null,
        username: 'hacker',
        public_metadata: { role: 'admin' },
      })
    );

    const req = createWebhookRequest(body, {
      'svix-signature': 'v1,FORGED_SIGNATURE_ATTEMPT',
    });
    const res = await webhookPOST(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/signature/i);
    // No user should have been created
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('rejects replay attack (valid signature but tampered body)', async () => {
    // Simulate verification failure when body was modified after signing
    mockVerify.mockImplementation(() => {
      throw new Error('Invalid signature - body modified');
    });

    const originalBody = JSON.stringify(
      userEvent('user.created', {
        id: 'user_legit',
        email_addresses: [{ email_address: 'legit@example.com', id: 'ea_1' }],
        first_name: 'Legit',
        last_name: null,
        username: 'legit',
        public_metadata: { role: 'user' },
      })
    );

    // Tamper the body by changing role to admin
    const tamperedBody = originalBody.replace('"user"', '"admin"');

    const req = createWebhookRequest(tamperedBody);
    const res = await webhookPOST(req);

    expect(res.status).toBe(401);
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it('rejects request with missing svix-id header', async () => {
    const body = JSON.stringify(
      userEvent('user.created', {
        id: 'user_123',
        email_addresses: [{ email_address: 'test@test.com', id: 'ea_1' }],
        first_name: 'Test',
        last_name: null,
        username: 'test',
        public_metadata: {},
      })
    );

    const req = new Request('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: {
        'svix-timestamp': '1234567890',
        'svix-signature': 'v1,sig',
        'content-type': 'application/json',
      },
      body,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(401);
  });

  it('rejects request with missing svix-timestamp header', async () => {
    const body = JSON.stringify(userEvent('user.created', { id: 'user_123' }));

    const req = new Request('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_123',
        'svix-signature': 'v1,sig',
        'content-type': 'application/json',
      },
      body,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(401);
  });

  it('rejects request with missing svix-signature header', async () => {
    const body = JSON.stringify(userEvent('user.created', { id: 'user_123' }));

    const req = new Request('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_123',
        'svix-timestamp': '1234567890',
        'content-type': 'application/json',
      },
      body,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(401);
  });

  it('rejects request with ALL svix headers missing', async () => {
    const body = JSON.stringify(userEvent('user.created', { id: 'user_123' }));

    const req = new Request('http://localhost/api/webhooks/clerk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const res = await webhookPOST(req);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Webhook spam / duplicate prevention
// ---------------------------------------------------------------------------
describe('Webhook duplicate user prevention', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CLERK_WEBHOOK_SECRET: 'whsec_sec_test' };
    mockVerify.mockImplementation((body: string) => JSON.parse(body));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not create duplicate user when clerkId already exists', async () => {
    const event = userEvent('user.created', {
      id: 'user_existing_clerk',
      email_addresses: [{ email_address: 'existing@test.com', id: 'ea_1' }],
      first_name: 'Existing',
      last_name: null,
      username: 'existing',
      public_metadata: {},
    });

    // First lookup by email -> null, second by clerkId -> found
    mockUser.findUnique
      .mockResolvedValueOnce(null) // by email
      .mockResolvedValueOnce({ id: 'u1', clerkId: 'user_existing_clerk' }); // by clerkId

    const req = createWebhookRequest(JSON.stringify(event));
    const res = await webhookPOST(req);

    expect(res.status).toBe(200);
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerkId: 'user_existing_clerk' },
      })
    );
  });

  it('does not create duplicate user when email already exists', async () => {
    const event = userEvent('user.created', {
      id: 'user_new_clerk_id',
      email_addresses: [{ email_address: 'already@exists.com', id: 'ea_1' }],
      first_name: 'Already',
      last_name: null,
      username: 'already',
      public_metadata: {},
    });

    // First lookup by email -> found
    mockUser.findUnique
      .mockResolvedValueOnce({ id: 'u1', email: 'already@exists.com' }) // by email
      .mockResolvedValueOnce(null); // by clerkId

    const req = createWebhookRequest(JSON.stringify(event));
    const res = await webhookPOST(req);

    expect(res.status).toBe(200);
    expect(mockUser.create).not.toHaveBeenCalled();
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'already@exists.com' },
        data: expect.objectContaining({ clerkId: 'user_new_clerk_id' }),
      })
    );
  });

  it('handles rapid duplicate user.created events for same clerkId gracefully', async () => {
    const event = userEvent('user.created', {
      id: 'user_rapid',
      email_addresses: [{ email_address: 'rapid@test.com', id: 'ea_1' }],
      first_name: 'Rapid',
      last_name: null,
      username: 'rapid',
      public_metadata: {},
    });

    // First call: neither exists -> create
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: 'u1' });

    const req1 = createWebhookRequest(JSON.stringify(event));
    const res1 = await webhookPOST(req1);
    expect(res1.status).toBe(200);
    expect(mockUser.create).toHaveBeenCalledTimes(1);

    // Second call: clerkId now exists -> update
    jest.clearAllMocks();
    mockVerify.mockImplementation((body: string) => JSON.parse(body));
    mockUser.findUnique
      .mockResolvedValueOnce(null) // by email
      .mockResolvedValueOnce({ id: 'u1', clerkId: 'user_rapid' }); // by clerkId

    const req2 = createWebhookRequest(JSON.stringify(event));
    const res2 = await webhookPOST(req2);
    expect(res2.status).toBe(200);
    expect(mockUser.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Webhook graceful handling of unexpected data
// ---------------------------------------------------------------------------
describe('Webhook handles unexpected/malformed data gracefully', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CLERK_WEBHOOK_SECRET: 'whsec_sec_test' };
    mockVerify.mockImplementation((body: string) => JSON.parse(body));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('handles webhook with extra unexpected fields without crashing', async () => {
    const event = userEvent('user.created', {
      id: 'user_extra_fields',
      email_addresses: [{ email_address: 'extra@test.com', id: 'ea_1' }],
      first_name: 'Extra',
      last_name: null,
      username: 'extra',
      public_metadata: {},
      // Extra unexpected fields
      phone_numbers: [{ phone_number: '+1234567890' }],
      profile_image_url: 'https://evil.com/image.jpg',
      created_at: 1234567890,
      updated_at: 1234567891,
      external_accounts: [{ provider: 'google' }],
      unsafe_metadata: { injection: '<script>alert("xss")</script>' },
    });

    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: 'u1' });

    const req = createWebhookRequest(JSON.stringify(event));
    const res = await webhookPOST(req);

    expect(res.status).toBe(200);
    expect(mockUser.create).toHaveBeenCalled();
  });

  it('handles XSS payload in username field', async () => {
    const event = userEvent('user.created', {
      id: 'user_xss',
      email_addresses: [{ email_address: 'xss@test.com', id: 'ea_1' }],
      first_name: '<script>alert("xss")</script>',
      last_name: null,
      username: '<img src=x onerror=alert(1)>',
      public_metadata: {},
    });

    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: 'u1' });

    const req = createWebhookRequest(JSON.stringify(event));
    const res = await webhookPOST(req);

    // Should not crash - stores the value (sanitization is a display concern)
    expect(res.status).toBe(200);
    expect(mockUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: '<img src=x onerror=alert(1)>',
      }),
    });
  });

  it('handles SQL injection attempt in email field', async () => {
    const event = userEvent('user.created', {
      id: 'user_sqli',
      email_addresses: [
        { email_address: "admin'--@test.com", id: 'ea_1' },
      ],
      first_name: 'SQLi',
      last_name: null,
      username: "'; DROP TABLE users; --",
      public_metadata: {},
    });

    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: 'u1' });

    const req = createWebhookRequest(JSON.stringify(event));
    const res = await webhookPOST(req);

    // Prisma parameterizes queries so this is safe - should not crash
    expect(res.status).toBe(200);
  });

  it('handles event with role escalation attempt in public_metadata', async () => {
    const event = userEvent('user.created', {
      id: 'user_escalation',
      email_addresses: [{ email_address: 'escalate@test.com', id: 'ea_1' }],
      first_name: 'Escalator',
      last_name: null,
      username: 'escalator',
      public_metadata: { role: 'admin', superadmin: true },
    });

    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: 'u1' });

    const req = createWebhookRequest(JSON.stringify(event));
    const res = await webhookPOST(req);

    // The webhook uses public_metadata.role directly; the key security
    // boundary is that only Clerk dashboard/API can set public_metadata.
    // The webhook trusts Clerk's verified payload after signature check.
    expect(res.status).toBe(200);
    expect(mockUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: 'admin', // Webhook trusts Clerk's verified public_metadata
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// Session-based security: getAuthSession with deleted user
// ---------------------------------------------------------------------------
describe('getAuthSession with deleted/missing user', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null (401) when clerkId points to deleted user', async () => {
    // When auth() returns null, the route returns 401
    mockAuthFn.mockResolvedValue(null);

    const response = await conversationsGET();
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Unauthorized');
  });
});

// ---------------------------------------------------------------------------
// Cross-user data access
// ---------------------------------------------------------------------------
describe('Cross-user data access prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 403 when user A tries to access user B conversation', async () => {
    // User A is authenticated
    mockAuthFn.mockResolvedValue({ user: { id: 'user-A' } });

    // Conversation belongs to user B
    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-B',
      status: 'in_progress',
      persona: { name: 'Alex', description: 'tough', roleType: 'Skeptic', characteristics: null },
      scenario: {
        title: 'Budget',
        description: 'Budget talk',
        userRole: 'Manager',
        aiRole: 'CFO',
        evaluationCriteria: '{}',
      },
      messages: [],
    });

    const req = createMessageRequest('conv-1');
    const res = await messagesPOST(req, createParams('conv-1'));

    expect(res.status).toBe(403);
  });

  it('returns 403 even with valid auth when conversation userId differs', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'attacker-id' } });

    mockConversation.findUnique.mockResolvedValue({
      id: 'conv-private',
      userId: 'victim-id',
      status: 'in_progress',
      persona: { name: 'P', description: 'd', roleType: 'R', characteristics: null },
      scenario: { title: 'S', description: 'd', userRole: 'U', aiRole: 'A', evaluationCriteria: '{}' },
      messages: [],
    });

    const req = createMessageRequest('conv-private');
    const res = await messagesPOST(req, createParams('conv-private'));

    expect(res.status).toBe(403);
    // Verify no message was created for the attacker
    expect(mockMessage.create).not.toHaveBeenCalled();
  });

  it('returns 404 when conversation does not exist (prevents enumeration)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-A' } });
    mockConversation.findUnique.mockResolvedValue(null);

    const req = createMessageRequest('nonexistent-id');
    const res = await messagesPOST(req, createParams('nonexistent-id'));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// Email verification enforcement
// ---------------------------------------------------------------------------
describe('Email verification enforcement on protected routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when user email is not verified on GET /conversations', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'unverified-user' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: null });

    const response = await conversationsGET();
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/not verified/i);
  });

  it('returns 403 when user email is not verified on POST /messages', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'unverified-user' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: null });

    const req = createMessageRequest('conv-1', { content: 'hi' });
    const res = await messagesPOST(req, createParams('conv-1'));

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/not verified/i);
  });

  it('returns 403 when user record not found (deleted after session)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'ghost-user' } });
    mockUser.findUnique.mockResolvedValue(null);

    const response = await conversationsGET();
    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Admin route protection at API level
// ---------------------------------------------------------------------------
describe('Admin route protection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /api/conversations returns 401 without auth', async () => {
    mockAuthFn.mockResolvedValue(null);

    const response = await conversationsGET();
    expect(response.status).toBe(401);
  });

  it('POST /api/conversations/[id]/messages returns 401 without auth', async () => {
    mockAuthFn.mockResolvedValue(null);

    const req = createMessageRequest('conv-1', { content: 'unauthorized' });
    const res = await messagesPOST(req, createParams('conv-1'));

    expect(res.status).toBe(401);
    expect(mockMessage.create).not.toHaveBeenCalled();
  });
});
