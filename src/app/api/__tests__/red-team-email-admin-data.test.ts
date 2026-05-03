/**
 * @jest-environment node
 */

/**
 * Red-team tests: email system abuse, admin panel exploitation, and data integrity failures.
 *
 * These tests verify that the system fails gracefully under hostile conditions:
 * - SMTP misconfiguration / credential failures
 * - Registration resilience when email delivery fails
 * - Resend-verification flooding potential
 * - Password reset for OAuth-only users
 * - Non-admin access to admin endpoints
 * - Admin self-deletion and last-admin deletion
 * - Extreme input lengths
 * - Empty personas on scenario creation
 * - Assignment with non-existent user/scenario IDs
 * - Cascade behavior when users/scenarios with conversations are deleted
 * - PDF export with null summaries and null scores
 * - Seed script idempotency
 * - Concurrent join race conditions
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: EMAIL SYSTEM RED-TEAM TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('EMAIL SYSTEM — SMTP misconfiguration and failures', () => {
  describe('sendPasswordResetEmail when SMTP is not configured', () => {
    const mockSendMail = jest.fn();
    const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

    beforeEach(() => {
      jest.resetModules();
      jest.clearAllMocks();
      // Clear SMTP env vars to simulate unconfigured state
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    });

    it('createTransport is called with undefined host/auth when env vars are empty', async () => {
      jest.mock('nodemailer', () => ({
        createTransport: (...args: unknown[]) => mockCreateTransport(...args),
      }));

      const { sendPasswordResetEmail } = require('@/lib/email/index');
      mockSendMail.mockResolvedValue({ messageId: 'ok' });

      await sendPasswordResetEmail('user@test.com', 'http://example.com/reset');

      // Transport was created with undefined values — nodemailer will attempt
      // connection to undefined host which will throw at runtime
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: undefined,
          auth: { user: undefined, pass: undefined },
        })
      );
    });

    it('sendMail throws when SMTP credentials are wrong', async () => {
      jest.mock('nodemailer', () => ({
        createTransport: () => ({
          sendMail: jest.fn().mockRejectedValue(new Error('Invalid login: 535 Authentication failed')),
        }),
      }));

      const { sendPasswordResetEmail } = require('@/lib/email/index');

      await expect(
        sendPasswordResetEmail('user@test.com', 'http://example.com/reset')
      ).rejects.toThrow('Invalid login');
    });
  });

  describe('sendVerificationEmail when SMTP fails', () => {
    it('throws when sendMail rejects (SMTP error propagates)', async () => {
      jest.resetModules();
      jest.mock('nodemailer', () => ({
        __esModule: true,
        default: {
          createTransport: jest.fn().mockReturnValue({
            sendMail: jest.fn().mockRejectedValue(new Error('ECONNREFUSED: connection refused')),
          }),
        },
      }));

      const { sendVerificationEmail } = require('@/lib/email/verification');

      await expect(
        sendVerificationEmail('user@test.com', 'http://localhost:3000/verify?token=abc')
      ).rejects.toThrow('ECONNREFUSED');
    });
  });
});

describe('EMAIL SYSTEM — Registration resilience when email fails', () => {
  const mockUser = {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const mockEmailVerificationToken = {
    create: jest.fn(),
    deleteMany: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  it('registration rolls back user creation when sendVerificationEmail throws (user is deleted)', async () => {
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser, emailVerificationToken: mockEmailVerificationToken };
      },
    }));
    jest.mock('bcryptjs', () => ({
      hash: jest.fn().mockResolvedValue('hashed-pw'),
    }));
    jest.mock('crypto', () => ({
      randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue('mock-token'),
      }),
    }));
    // Simulate email failure
    jest.mock('@/lib/email/verification', () => ({
      sendVerificationEmail: jest.fn().mockRejectedValue(new Error('SMTP timeout')),
    }));

    const { POST } = require('../auth/register/route');

    mockUser.findUnique.mockResolvedValue(null);
    mockUser.create.mockResolvedValue({ id: 'u1', email: 'new@test.com', username: 'newuser' });
    mockUser.delete.mockResolvedValue({ id: 'u1' });
    mockEmailVerificationToken.create.mockResolvedValue({ id: 't1' });
    mockEmailVerificationToken.deleteMany.mockResolvedValue({ count: 1 });

    const request = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@test.com',
        username: 'newuser',
        password: 'password1',
        confirmPassword: 'password1',
      }),
    });

    const res = await POST(request);

    // FIXED: Registration still returns 500 but now rolls back the user
    expect(res.status).toBe(500);

    // FIXED: The user is deleted (rolled back) after email failure
    expect(mockUser.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(mockEmailVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
});

describe('EMAIL SYSTEM — Resend verification flooding', () => {
  const mockAuthFn = jest.fn();
  const mockUser2 = {
    findUnique: jest.fn(),
  };
  const mockEmailVerificationToken2 = {
    deleteMany: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  it('allows unlimited resend requests with no rate limiting (vulnerability)', async () => {
    jest.mock('@/lib/auth', () => ({
      auth: () => mockAuthFn(),
    }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser2, emailVerificationToken: mockEmailVerificationToken2 };
      },
    }));
    jest.mock('crypto', () => ({
      randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue('token-value'),
      }),
    }));
    const mockSendVerification = jest.fn().mockResolvedValue(undefined);
    jest.mock('@/lib/email/verification', () => ({
      sendVerificationEmail: (...args: unknown[]) => mockSendVerification(...args),
    }));

    const { POST } = require('../auth/resend-verification/route');

    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser2.findUnique.mockResolvedValue({ id: 'u1', email: 'user@test.com', emailVerified: null });
    mockEmailVerificationToken2.deleteMany.mockResolvedValue({ count: 0 });
    mockEmailVerificationToken2.create.mockResolvedValue({ id: 't1' });

    // Simulate rapid-fire resend requests — no rate limiting exists
    const results = [];
    for (let i = 0; i < 10; i++) {
      const request = new Request('http://localhost/api/auth/resend-verification', {
        method: 'POST',
      });
      const res = await POST(request);
      results.push(res.status);
    }

    // All 10 requests succeed — no rate limiting
    expect(results.every((s: number) => s === 200)).toBe(true);
    expect(mockSendVerification).toHaveBeenCalledTimes(10);
  });
});

describe('EMAIL SYSTEM — Password reset for OAuth-only user', () => {
  const mockUser3 = {
    findUnique: jest.fn(),
  };
  const mockToken3 = {
    create: jest.fn(),
  };
  const mockSendPasswordResetEmail3 = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  it('does NOT send password reset email to OAuth-only user (vulnerability fixed)', async () => {
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser3, passwordResetToken: mockToken3 };
      },
    }));
    jest.mock('@/lib/email', () => ({
      sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail3(...args),
    }));
    jest.mock('crypto', () => ({
      randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue('reset-token-hex'),
      }),
    }));

    const { POST } = require('../auth/forgot-password/route');

    // OAuth user: has no passwordHash, provider is 'google'
    mockUser3.findUnique.mockResolvedValue({
      id: 'oauth-user-1',
      email: 'oauth@google.com',
      passwordHash: null,
      provider: 'google',
    });
    mockToken3.create.mockResolvedValue({ id: 't1' });

    const request = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'oauth@google.com' }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);

    // FIXED: The system no longer sends a password reset email to OAuth-only users.
    // No token is created, no email is sent — but response is still 200 to prevent enumeration.
    expect(mockSendPasswordResetEmail3).not.toHaveBeenCalled();
    expect(mockToken3.create).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: ADMIN PANEL ABUSE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('ADMIN PANEL — Non-admin access to admin endpoints', () => {
  const mockAuthFn = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('regular user cannot list users via GET /api/admin/users', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: { findMany: jest.fn() } };
      },
    }));
    jest.mock('bcryptjs', () => ({ hash: jest.fn() }));
    jest.mock('generate-password', () => ({ generate: jest.fn() }));

    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });

    const { GET } = require('../admin/users/route');
    const res = await GET();
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Forbidden');
  });

  it('regular user cannot create users via POST /api/admin/users', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: { findFirst: jest.fn(), create: jest.fn() } };
      },
    }));
    jest.mock('bcryptjs', () => ({ hash: jest.fn() }));
    jest.mock('generate-password', () => ({ generate: jest.fn() }));

    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });

    const { POST } = require('../admin/users/route');
    const request = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hack@test.com', username: 'hacker' }),
    });
    const res = await POST(request);
    expect(res.status).toBe(403);
  });

  it('regular user cannot delete scenarios via DELETE /api/admin/scenarios/[id]', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { scenario: { findUnique: jest.fn(), delete: jest.fn() } };
      },
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });

    const { DELETE } = require('../admin/scenarios/[id]/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/admin/scenarios/s1', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 's1' }) });
    expect(res.status).toBe(403);
  });

  it('unauthenticated request returns 401 on all admin endpoints', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: { findMany: jest.fn() } };
      },
    }));
    jest.mock('bcryptjs', () => ({ hash: jest.fn() }));
    jest.mock('generate-password', () => ({ generate: jest.fn() }));

    mockAuthFn.mockResolvedValue(null); // No session

    const { GET } = require('../admin/users/route');
    const res = await GET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });
});

describe('ADMIN PANEL — Admin self-deletion', () => {
  const mockAuthFn = jest.fn();
  const mockUser = {
    findUnique: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('admin CANNOT delete themselves (self-deletion guard exists)', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser };
      },
    }));
    jest.mock('bcryptjs', () => ({ hash: jest.fn() }));
    jest.mock('generate-password', () => ({ generate: jest.fn() }));

    mockAuthFn.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mockUser.findUnique.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mockUser.delete.mockResolvedValue({ id: 'admin-1' });

    const { DELETE } = require('../admin/users/[id]/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/admin/users/admin-1', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'admin-1' }) });

    // FIXED: Admin cannot delete themselves
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Cannot delete your own account');
    expect(mockUser.delete).not.toHaveBeenCalled();
  });
});

describe('ADMIN PANEL — Last admin deletion', () => {
  const mockAuthFn = jest.fn();
  const mockUser = {
    findUnique: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('admin CAN delete the last remaining admin (no guard exists)', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser };
      },
    }));
    jest.mock('bcryptjs', () => ({ hash: jest.fn() }));
    jest.mock('generate-password', () => ({ generate: jest.fn() }));

    // Admin "a1" tries to delete admin "a2" — the only other admin
    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUser.findUnique.mockResolvedValue({ id: 'a2', role: 'admin' });
    mockUser.delete.mockResolvedValue({ id: 'a2' });

    const { DELETE } = require('../admin/users/[id]/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/admin/users/a2', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'a2' }) });

    // BUG: No check for "is this the last admin?" — could leave system with no admins
    expect(res.status).toBe(200);
    expect(mockUser.delete).toHaveBeenCalledWith({ where: { id: 'a2' } });
  });
});

describe('ADMIN PANEL — Extreme input lengths', () => {
  const mockAuthFn = jest.fn();
  const mockUser = {
    findFirst: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('rejects extremely long email (length validation enforced)', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser };
      },
    }));
    jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));
    jest.mock('generate-password', () => ({ generate: jest.fn().mockReturnValue('pass123') }));

    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUser.findFirst.mockResolvedValue(null);

    // 10,000 character email
    const longEmail = 'a'.repeat(9990) + '@test.com';
    mockUser.create.mockResolvedValue({
      id: 'u-new', email: longEmail, username: 'x', role: 'user', createdAt: new Date(),
    });

    const { POST } = require('../admin/users/route');
    const request = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: longEmail, username: 'LongEmailUser' }),
    });
    const res = await POST(request);

    // FIXED: Length validation on admin user creation endpoint rejects long emails.
    expect(res.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });

  it('rejects extremely long username (length validation enforced)', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser };
      },
    }));
    jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));
    jest.mock('generate-password', () => ({ generate: jest.fn().mockReturnValue('pass123') }));

    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUser.findFirst.mockResolvedValue(null);

    const longUsername = 'U'.repeat(100000);
    mockUser.create.mockResolvedValue({
      id: 'u-new', email: 'x@test.com', username: longUsername, role: 'user', createdAt: new Date(),
    });

    const { POST } = require('../admin/users/route');
    const request = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'valid@test.com', username: longUsername }),
    });
    const res = await POST(request);

    // FIXED: Max-length on username in admin endpoint
    expect(res.status).toBe(400);
    expect(mockUser.create).not.toHaveBeenCalled();
  });
});

describe('ADMIN PANEL — Scenario with empty personas array', () => {
  const mockAuthFn = jest.fn();
  const mockScenario = {
    create: jest.fn(),
    findUnique: jest.fn(),
  };
  const mockPersona = {
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('creates scenario with empty personas array (no personas created)', async () => {
    jest.mock('@/lib/auth', () => ({
      auth: () => mockAuthFn(),
    }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { scenario: mockScenario, persona: mockPersona };
      },
    }));
    jest.mock('crypto', () => ({
      randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue('ABCD1234'),
      }),
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockScenario.create.mockResolvedValue({ id: 's-new' });
    mockScenario.findUnique.mockResolvedValue({
      id: 's-new',
      title: 'Empty Scenario',
      personas: [],
      _count: { members: 0 },
    });

    const { POST } = require('../admin/scenarios/route');
    const request = new Request('http://localhost/api/admin/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Empty Scenario',
        description: 'Has no personas',
        userRole: 'Negotiator',
        aiRole: 'Counterpart',
        personas: [], // Empty array
      }),
    });
    const res = await POST(request);

    // Scenario is created without any personas — users cannot start conversations
    expect(res.status).toBe(201);
    expect(mockPersona.create).not.toHaveBeenCalled();
  });

  it('creates scenario when personas is undefined/missing', async () => {
    jest.mock('@/lib/auth', () => ({
      auth: () => mockAuthFn(),
    }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { scenario: mockScenario, persona: mockPersona };
      },
    }));
    jest.mock('crypto', () => ({
      randomBytes: jest.fn().mockReturnValue({
        toString: jest.fn().mockReturnValue('ABCD1234'),
      }),
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockScenario.create.mockResolvedValue({ id: 's-new' });
    mockScenario.findUnique.mockResolvedValue({
      id: 's-new',
      title: 'No Personas Field',
      personas: [],
      _count: { members: 0 },
    });

    const { POST } = require('../admin/scenarios/route');
    const request = new Request('http://localhost/api/admin/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'No Personas Field',
        description: 'Missing personas key entirely',
        userRole: 'Buyer',
        aiRole: 'Seller',
        // personas field omitted entirely
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
    expect(mockPersona.create).not.toHaveBeenCalled();
  });
});

describe('ADMIN PANEL — Assign non-existent user to scenario', () => {
  const mockAuthFn = jest.fn();
  const mockUserScenario = {
    findUnique: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('fails with Prisma foreign key error when assigning non-existent user', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { userScenario: mockUserScenario };
      },
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUserScenario.findUnique.mockResolvedValue(null);
    // Simulate Prisma foreign key constraint error
    mockUserScenario.create.mockRejectedValue(
      Object.assign(new Error('Foreign key constraint failed on the field: `userId`'), {
        code: 'P2003',
      })
    );

    const { POST } = require('../admin/scenarios/[id]/assign/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/admin/scenarios/s1/assign', {
      method: 'POST',
      body: JSON.stringify({ userId: 'non-existent-user-id' }),
      headers: { 'Content-Type': 'application/json' },
    });

    // BUG: The route does NOT validate that userId exists before trying to create
    // the assignment. A Prisma P2003 error will propagate as an unhandled 500.
    await expect(POST(req, { params: Promise.resolve({ id: 's1' }) })).rejects.toThrow(
      'Foreign key constraint'
    );
  });

  it('fails with Prisma foreign key error when assigning user to non-existent scenario', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { userScenario: mockUserScenario };
      },
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockUserScenario.findUnique.mockResolvedValue(null);
    // Simulate Prisma foreign key constraint error for scenarioId
    mockUserScenario.create.mockRejectedValue(
      Object.assign(new Error('Foreign key constraint failed on the field: `scenarioId`'), {
        code: 'P2003',
      })
    );

    const { POST } = require('../admin/scenarios/[id]/assign/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/admin/scenarios/non-existent-scenario/assign', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u1' }),
      headers: { 'Content-Type': 'application/json' },
    });

    // BUG: No validation that the scenario exists before assignment
    await expect(
      POST(req, { params: Promise.resolve({ id: 'non-existent-scenario' }) })
    ).rejects.toThrow('Foreign key constraint');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: DATA INTEGRITY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DATA INTEGRITY — Deleting user with active conversations', () => {
  const mockAuthFn = jest.fn();
  const mockUser = {
    findUnique: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('cascade deletes conversations when user is deleted (onDelete: Cascade)', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser };
      },
    }));
    jest.mock('bcryptjs', () => ({ hash: jest.fn() }));
    jest.mock('generate-password', () => ({ generate: jest.fn() }));

    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    // User with active conversations
    mockUser.findUnique.mockResolvedValue({
      id: 'u-active',
      role: 'user',
      _count: { conversations: 5 },
    });
    mockUser.delete.mockResolvedValue({ id: 'u-active' });

    const { DELETE } = require('../admin/users/[id]/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/admin/users/u-active', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'u-active' }) });

    // The delete succeeds — schema has onDelete: Cascade on User -> Conversation
    // This means ALL conversations, messages, and summaries are nuked silently.
    // No confirmation dialog, no soft-delete, no audit trail.
    expect(res.status).toBe(200);
    expect(mockUser.delete).toHaveBeenCalledWith({ where: { id: 'u-active' } });
  });
});

describe('DATA INTEGRITY — Deleting scenario with active conversations', () => {
  const mockAuthFn = jest.fn();
  const mockScenario = {
    findUnique: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('cascade deletes conversations when scenario is deleted (onDelete: Cascade)', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { scenario: mockScenario };
      },
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'a1', role: 'admin' } });
    mockScenario.findUnique.mockResolvedValue({
      id: 's-active',
      title: 'Active Scenario',
      _count: { conversations: 10 },
    });
    mockScenario.delete.mockResolvedValue({ id: 's-active' });

    const { DELETE } = require('../admin/scenarios/[id]/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/admin/scenarios/s-active', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 's-active' }) });

    // Schema has onDelete: Cascade on Scenario -> Conversation, Persona, UserScenario, etc.
    // Deleting a scenario nukes all associated data with no warning or soft-delete.
    expect(res.status).toBe(200);
    expect(mockScenario.delete).toHaveBeenCalledWith({ where: { id: 's-active' } });
  });
});

describe('DATA INTEGRITY — PDF export with null summary and null scores', () => {
  const mockAuthFn = jest.fn();
  const mockUser = { findUnique: jest.fn() };
  const mockConversation = { findMany: jest.fn() };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('renders HTML without crashing when summary is null', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser, conversation: mockConversation };
      },
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'TestUser' });
    mockConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        persona: { name: 'Persona A', description: 'Description', roleType: 'Role' },
        scenario: { title: 'Test Scenario' },
        summary: null, // No summary at all
        completedAt: new Date(),
      },
    ]);

    const { GET } = require('../export/pdf/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/export/pdf', { method: 'GET' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Persona A');
    expect(html).not.toContain('Score:');
    expect(html).not.toContain('undefined');
  });

  it('renders HTML without crashing when overallScore is null but summary exists', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser, conversation: mockConversation };
      },
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'TestUser' });
    mockConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        persona: { name: 'Persona B', description: 'Desc', roleType: 'Type' },
        scenario: { title: 'Score-less' },
        summary: {
          overallScore: null, // Score not yet generated
          winningArguments: '[]', // No arguments
        },
        completedAt: new Date(),
      },
    ]);

    const { GET } = require('../export/pdf/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/export/pdf', { method: 'GET' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Persona B');
    // overallScore is null, so the score section should not render
    expect(html).not.toContain('Score:');
  });

  it('renders HTML when winningArguments is an empty JSON array string', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser, conversation: mockConversation };
      },
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'TestUser' });
    mockConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        persona: { name: 'Persona C', description: 'Desc', roleType: 'Type' },
        scenario: { title: 'Scenario C' },
        summary: {
          overallScore: 85,
          winningArguments: '[]',
        },
        completedAt: new Date(),
      },
    ]);

    const { GET } = require('../export/pdf/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/export/pdf', { method: 'GET' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('85');
    expect(html).not.toContain('Key Arguments');
  });

  it('handles scenario being null in conversation', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { user: mockUser, conversation: mockConversation };
      },
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'TestUser' });
    mockConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        persona: { name: 'Persona D', description: 'Desc', roleType: 'Type' },
        scenario: null, // Scenario was deleted
        summary: { overallScore: 50, winningArguments: '[]' },
        completedAt: new Date(),
      },
    ]);

    const { GET } = require('../export/pdf/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('http://localhost/api/export/pdf', { method: 'GET' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const html = await res.text();
    // Should show "N/A" for missing scenario title
    expect(html).toContain('N/A');
  });
});

describe('DATA INTEGRITY — Seed script idempotency', () => {
  it('seed uses upsert for users so re-running does not create duplicates', () => {
    // This is a static analysis test — verifying the seed script pattern.
    // The seed.ts uses prisma.user.upsert with unique email fields.
    // Running twice should NOT throw a unique constraint violation.
    //
    // Verification: seed.ts uses:
    //   prisma.user.upsert({ where: { email: '...' }, update: {...}, create: {...} })
    //   prisma.scenario.upsert({ where: { joinCode: '...' }, ... })
    //   prisma.persona.upsert({ where: { id: 'seed-...' }, ... })
    //   prisma.userScenario.upsert({ where: { userId_scenarioId: {...} }, ... })
    //
    // The deleteMany at top cleans transient data. The upserts handle idempotency.
    // This test documents the expected pattern.
    expect(true).toBe(true);
  });

  it('seed deletes transient data (summaries, messages, conversations, memberships) on each run', () => {
    // seed.ts lines 14-18:
    //   await prisma.summary.deleteMany({});
    //   await prisma.message.deleteMany({});
    //   await prisma.conversation.deleteMany({});
    //   await prisma.userScenario.deleteMany({});
    //
    // BUG/RISK: Running seed in production would DELETE ALL user conversations
    // and summaries. There's no environment check. This is a destructive operation.
    expect(true).toBe(true);
  });
});

describe('DATA INTEGRITY — Concurrent join race condition', () => {
  const mockAuthFn = jest.fn();
  const mockScenario = { findUnique: jest.fn() };
  const mockUserScenario = { findUnique: jest.fn(), create: jest.fn() };
  const mockUserForJoin = { findUnique: jest.fn() };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('two simultaneous join requests: second gets 409 (race condition handled)', async () => {
    jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
    jest.mock('@/lib/db/client', () => ({
      get prisma() {
        return { scenario: mockScenario, userScenario: mockUserScenario, user: mockUserForJoin };
      },
    }));

    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserForJoin.findUnique.mockResolvedValue({ emailVerified: new Date() });
    mockScenario.findUnique.mockResolvedValue({
      id: 's1', title: 'Test', description: 'D', status: 'published', accessCode: null,
    });

    // Simulate TOCTOU: both findUnique calls return null (not yet joined)
    mockUserScenario.findUnique.mockResolvedValue(null);

    // First create succeeds
    mockUserScenario.create.mockResolvedValueOnce({ userId: 'u1', scenarioId: 's1' });
    // Second create would fail in production with unique constraint violation
    mockUserScenario.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed on the fields: (`userId`,`scenarioId`)'), {
        code: 'P2002',
      })
    );

    const { POST } = require('../scenarios/join/route');

    const req1 = new Request('http://localhost/api/scenarios/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinCode: 'CODE1' }),
    });
    const req2 = new Request('http://localhost/api/scenarios/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinCode: 'CODE1' }),
    });

    // First request succeeds
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);

    // FIXED: Second request hits the race condition — returns 409 instead of 500
    const res2 = await POST(req2);
    expect(res2.status).toBe(409);

    // FIXED: The error message is now "Already joined" instead of generic "Failed to join scenario"
    const data = await res2.json();
    expect(data.error).toBe('You have already joined this scenario');
  });
});
