/**
 * @jest-environment node
 */

const mockVerify = jest.fn();
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({
    verify: mockVerify,
  })),
}));

const mockUser = {
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: mockUser };
  },
}));

import { POST } from '../route';

function createRequest(body: string, headers: Record<string, string> = {}) {
  const defaultHeaders: Record<string, string> = {
    'svix-id': 'msg_test123',
    'svix-timestamp': '1234567890',
    'svix-signature': 'v1,validSignature',
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
  // Clerk marks addresses as verified before it fires user.created in practice; fixtures default to that.
  const addresses = Array.isArray(data.email_addresses)
    ? (data.email_addresses as Array<Record<string, unknown>>).map((a) => ({ verification: { status: 'verified' }, ...a }))
    : data.email_addresses;
  return { type, data: { ...data, email_addresses: addresses } };
}

describe('POST /api/webhooks/clerk', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CLERK_WEBHOOK_SECRET: 'whsec_test123' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  // Signature validation
  // -------------------------------------------------------------------------
  describe('signature validation', () => {
    it('returns 500 when CLERK_WEBHOOK_SECRET not set', async () => {
      delete process.env.CLERK_WEBHOOK_SECRET;
      const req = createRequest(JSON.stringify({}));
      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toMatch(/secret/i);
    });

    it('returns 401 when svix-id missing', async () => {
      const req = new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        headers: {
          'svix-timestamp': '1234567890',
          'svix-signature': 'v1,sig',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 when svix-timestamp missing', async () => {
      const req = new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-signature': 'v1,sig',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 when svix-signature missing', async () => {
      const req = new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_123',
          'svix-timestamp': '1234567890',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 when all svix headers missing', async () => {
      const req = new Request('http://localhost/api/webhooks/clerk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 when signature verification fails (wh.verify throws)', async () => {
      mockVerify.mockImplementation(() => {
        throw new Error('Invalid signature');
      });
      const req = createRequest(JSON.stringify({}));
      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/signature/i);
    });
  });

  // -------------------------------------------------------------------------
  // user.created / user.updated
  // -------------------------------------------------------------------------
  describe('user.created/updated', () => {
    beforeEach(() => {
      mockVerify.mockImplementation((body: string) => JSON.parse(body));
    });

    it('returns 400 when no email in event', async () => {
      const event = userEvent('user.created', {
        id: 'user_123',
        email_addresses: [],
        first_name: 'Test',
        last_name: 'User',
        username: null,
        public_metadata: {},
      });
      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/email/i);
    });

    it('returns 400 when data.id is missing', async () => {
      const event = userEvent('user.created', {
        id: '',
        email_addresses: [{ email_address: 'test@test.com', id: 'ea_1' }],
        first_name: 'Test',
        last_name: 'User',
        username: null,
        public_metadata: {},
      });
      // data.id is falsy (empty string)
      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/missing user id/i);
    });

    it('creates new user when neither email nor clerkId exists', async () => {
      const event = userEvent('user.created', {
        id: 'user_new',
        email_addresses: [{ email_address: 'new@test.com', id: 'ea_1' }],
        first_name: 'New',
        last_name: 'User',
        username: 'newuser',
        public_metadata: {},
      });
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'u1' });

      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clerkId: 'user_new',
          email: 'new@test.com',
          username: 'newuser',
          role: 'user',
        }),
      });
    });

    it('uses Clerk username field', async () => {
      const event = userEvent('user.created', {
        id: 'user_123',
        email_addresses: [{ email_address: 'test@test.com', id: 'ea_1' }],
        first_name: 'First',
        last_name: 'Last',
        username: 'myusername',
        public_metadata: {},
      });
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'u1' });

      const req = createRequest(JSON.stringify(event));
      await POST(req);
      expect(mockUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ username: 'myusername' }),
      });
    });

    it('uses first_name + last_name when username is null', async () => {
      const event = userEvent('user.created', {
        id: 'user_123',
        email_addresses: [{ email_address: 'test@test.com', id: 'ea_1' }],
        first_name: 'John',
        last_name: 'Doe',
        username: null,
        public_metadata: {},
      });
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'u1' });

      const req = createRequest(JSON.stringify(event));
      await POST(req);
      expect(mockUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ username: 'John Doe' }),
      });
    });

    it('uses email prefix when all name fields null', async () => {
      const event = userEvent('user.created', {
        id: 'user_123',
        email_addresses: [{ email_address: 'hello@world.com', id: 'ea_1' }],
        first_name: null,
        last_name: null,
        username: null,
        public_metadata: {},
      });
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'u1' });

      const req = createRequest(JSON.stringify(event));
      await POST(req);
      expect(mockUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ username: 'hello' }),
      });
    });

    it('appends timestamp when username is taken', async () => {
      const event = userEvent('user.created', {
        id: 'user_123',
        email_addresses: [{ email_address: 'test@test.com', id: 'ea_1' }],
        first_name: null,
        last_name: null,
        username: 'taken',
        public_metadata: {},
      });
      // First call: findUnique by email -> null; second: by clerkId -> null; third: username check -> taken
      mockUser.findUnique
        .mockResolvedValueOnce(null) // by email
        .mockResolvedValueOnce(null) // by clerkId
        .mockResolvedValueOnce({ id: 'existing' }); // username taken
      mockUser.create.mockResolvedValue({ id: 'u1' });

      const req = createRequest(JSON.stringify(event));
      await POST(req);
      expect(mockUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          username: expect.stringMatching(/^taken-/),
        }),
      });
    });

    it('refuses to create or link a row from an unverified email', async () => {
      const event = userEvent('user.created', {
        id: 'user_unverified',
        email_addresses: [{ email_address: 'admin@persuaider.dev', id: 'ea_1', verification: { status: 'unverified' } }],
        first_name: 'Mallory',
        last_name: null,
        username: 'mallory',
        public_metadata: {},
      });
      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockUser.create).not.toHaveBeenCalled();
      expect(mockUser.update).not.toHaveBeenCalled();
    });

    it('uses role from public_metadata', async () => {
      const event = userEvent('user.created', {
        id: 'user_123',
        email_addresses: [{ email_address: 'admin@test.com', id: 'ea_1' }],
        first_name: 'Admin',
        last_name: null,
        username: 'admin',
        public_metadata: { role: 'admin' },
      });
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'u1' });

      const req = createRequest(JSON.stringify(event));
      await POST(req);
      expect(mockUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'admin' }),
      });
    });

    it('defaults role to user', async () => {
      const event = userEvent('user.created', {
        id: 'user_123',
        email_addresses: [{ email_address: 'test@test.com', id: 'ea_1' }],
        first_name: 'Test',
        last_name: null,
        username: 'testuser',
        public_metadata: {},
      });
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'u1' });

      const req = createRequest(JSON.stringify(event));
      await POST(req);
      expect(mockUser.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: 'user' }),
      });
    });

    it('updates user found by clerkId without touching the database role (DB role is the source of truth)', async () => {
      const event = userEvent('user.updated', {
        id: 'user_existing',
        email_addresses: [{ email_address: 'updated@test.com', id: 'ea_1' }],
        first_name: 'Updated',
        last_name: null,
        username: 'updateduser',
        public_metadata: { role: 'admin' },
      });
      mockUser.findUnique
        .mockResolvedValueOnce(null) // by email
        .mockResolvedValueOnce({ id: 'u1', clerkId: 'user_existing' }); // by clerkId

      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockUser.update).toHaveBeenCalledWith({
        where: { clerkId: 'user_existing' },
        data: expect.objectContaining({ email: 'updated@test.com' }),
      });
      expect(mockUser.update.mock.calls[0][0].data).not.toHaveProperty('role');
    });

    it('links clerkId to user found by email', async () => {
      const event = userEvent('user.created', {
        id: 'user_new_clerk',
        email_addresses: [{ email_address: 'existing@test.com', id: 'ea_1' }],
        first_name: 'Existing',
        last_name: null,
        username: 'existing',
        public_metadata: {},
      });
      mockUser.findUnique
        .mockResolvedValueOnce({ id: 'u1', email: 'existing@test.com' }) // by email
        .mockResolvedValueOnce(null); // by clerkId

      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockUser.update).toHaveBeenCalledWith({
        where: { email: 'existing@test.com' },
        data: expect.objectContaining({ clerkId: 'user_new_clerk' }),
      });
    });

    it('returns 200 with received true', async () => {
      const event = userEvent('user.created', {
        id: 'user_123',
        email_addresses: [{ email_address: 'test@test.com', id: 'ea_1' }],
        first_name: 'Test',
        last_name: null,
        username: 'testuser',
        public_metadata: {},
      });
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'u1' });

      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // user.deleted
  // -------------------------------------------------------------------------
  describe('user.deleted', () => {
    beforeEach(() => {
      mockVerify.mockImplementation((body: string) => JSON.parse(body));
    });

    it('nullifies clerkId when user exists', async () => {
      const event = userEvent('user.deleted', {
        id: 'user_to_delete',
        email_addresses: [],
        first_name: null,
        last_name: null,
        username: null,
        public_metadata: {},
      });
      mockUser.findUnique.mockResolvedValue({ id: 'u1', clerkId: 'user_to_delete' });

      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockUser.update).toHaveBeenCalledWith({
        where: { clerkId: 'user_to_delete' },
        data: { clerkId: null },
      });
    });

    it('does nothing when user does not exist', async () => {
      const event = userEvent('user.deleted', {
        id: 'user_nonexistent',
        email_addresses: [],
        first_name: null,
        last_name: null,
        username: null,
        public_metadata: {},
      });
      mockUser.findUnique.mockResolvedValue(null);

      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(mockUser.update).not.toHaveBeenCalled();
    });

    it('returns 200 regardless', async () => {
      const event = userEvent('user.deleted', {
        id: 'user_any',
        email_addresses: [],
        first_name: null,
        last_name: null,
        username: null,
        public_metadata: {},
      });
      mockUser.findUnique.mockResolvedValue(null);

      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown events
  // -------------------------------------------------------------------------
  describe('unknown events', () => {
    beforeEach(() => {
      mockVerify.mockImplementation((body: string) => JSON.parse(body));
    });

    it('returns 200 for unknown event types', async () => {
      const event = userEvent('session.created', {
        id: 'sess_123',
        email_addresses: [],
        first_name: null,
        last_name: null,
        username: null,
        public_metadata: {},
      });

      const req = createRequest(JSON.stringify(event));
      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.received).toBe(true);
    });
  });
});
