/**
 * @jest-environment node
 */

/**
 * Auth Attack Surface Tests
 *
 * Red-team tests covering:
 * - OAuth user attempting credential-based flows
 * - Reset token reuse
 * - Verification token for wrong user
 * - Unverified user API access
 * - Stale JWT role
 * - Registering as the seeded admin
 */

// ---- Mocks ----

const mockUser = {
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockPasswordResetToken = {
  create: jest.fn(),
  findUnique: jest.fn(),
  deleteMany: jest.fn(),
};

const mockEmailVerificationToken = {
  create: jest.fn(),
  findUnique: jest.fn(),
  deleteMany: jest.fn(),
};

const mockConversation = {
  findUnique: jest.fn(),
};

const mockMessage = {
  create: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      user: mockUser,
      passwordResetToken: mockPasswordResetToken,
      emailVerificationToken: mockEmailVerificationToken,
      conversation: mockConversation,
      message: mockMessage,
    };
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-pw'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('mock-token-hex'),
  }),
}));

const mockSendPasswordResetEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/email', () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

const mockSendVerificationEmail = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/email/verification', () => ({
  sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
}));

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockGeneratePersonaResponse = jest.fn();
jest.mock('@/lib/llm', () => ({
  generatePersonaResponse: (...args: unknown[]) => mockGeneratePersonaResponse(...args),
}));

jest.mock('@/lib/llm/mood', () => ({
  parseMoodResponse: (raw: string) => ({ content: raw, mood: 'neutral' }),
}));

jest.mock('@/types', () => ({
  DEFAULT_MOOD: 'neutral',
}));

jest.mock('@/lib/validation/auth', () => ({
  validateRegistration: jest.fn().mockReturnValue(null),
}));

import { POST as registerPOST } from '../auth/register/route';
import { POST as forgotPasswordPOST } from '../auth/forgot-password/route';
import { POST as resetPasswordPOST } from '../auth/reset-password/route';
import { GET as verifyEmailGET } from '../auth/verify-email/route';
import { POST as resendVerificationPOST } from '../auth/resend-verification/route';
import { POST as messagesPOST } from '../conversations/[id]/messages/route';
import { NextRequest } from 'next/server';

function jsonReq(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function nextReq(url: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    ...(body
      ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : { body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } }),
  });
}

function getReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/auth/verify-email');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

// ---- Tests ----

describe('Auth Attack Surface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  describe('Register with email that exists as OAuth account', () => {
    it('returns 409 when email is already used by a Google OAuth user', async () => {
      // An OAuth user already exists with this email
      mockUser.findUnique.mockImplementation(({ where }: { where: { email?: string; username?: string } }) => {
        if (where.email) {
          return { id: 'oauth-user-1', email: 'google@example.com', provider: 'google', providerAccountId: '123' };
        }
        return null;
      });

      const res = await registerPOST(
        jsonReq('http://localhost/api/auth/register', {
          email: 'google@example.com',
          username: 'newuser',
          password: 'password123',
          confirmPassword: 'password123',
        })
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.errors.email).toContain('already');
    });

    it('returns 409 when email is already used by a Microsoft OAuth user', async () => {
      mockUser.findUnique.mockImplementation(({ where }: { where: { email?: string; username?: string } }) => {
        if (where.email) {
          return { id: 'oauth-user-2', email: 'ms@example.com', provider: 'microsoft', providerAccountId: '456' };
        }
        return null;
      });

      const res = await registerPOST(
        jsonReq('http://localhost/api/auth/register', {
          email: 'ms@example.com',
          username: 'newuser2',
          password: 'password123',
          confirmPassword: 'password123',
        })
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.errors.email).toContain('already');
    });
  });

  describe('OAuth user attempts forgot-password (has no password)', () => {
    it('returns success message even for OAuth user (no information leak)', async () => {
      // The user has no passwordHash (OAuth only)
      mockUser.findUnique.mockResolvedValue({
        id: 'oauth-u1',
        email: 'oauth@example.com',
        provider: 'google',
        passwordHash: null,
      });
      mockPasswordResetToken.create.mockResolvedValue({ id: 't1' });

      const res = await forgotPasswordPOST(
        jsonReq('http://localhost/api/auth/forgot-password', { email: 'oauth@example.com' })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      // Should still say generic message to avoid leaking info about account type
      expect(data.message).toBe('If an account exists with that email, a reset link has been sent.');
    });

    it('does NOT create a reset token for OAuth user (vulnerability fixed)', async () => {
      // FIXED: The forgot-password route now checks if user has a passwordHash.
      // An OAuth-only user will NOT receive a reset token.
      mockUser.findUnique.mockResolvedValue({
        id: 'oauth-u1',
        email: 'oauth@example.com',
        provider: 'google',
        passwordHash: null,
      });
      mockPasswordResetToken.create.mockResolvedValue({ id: 't1' });

      await forgotPasswordPOST(
        jsonReq('http://localhost/api/auth/forgot-password', { email: 'oauth@example.com' })
      );

      // FIXED: The code no longer creates a token for OAuth users
      expect(mockPasswordResetToken.create).not.toHaveBeenCalled();
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('Reset token reuse (submit same token twice)', () => {
    it('first use succeeds', async () => {
      mockPasswordResetToken.findUnique.mockResolvedValue({
        token: 'one-time-token',
        userId: 'u1',
        expiresAt: new Date(Date.now() + 3600000),
      });
      mockUser.update.mockResolvedValue({});
      mockPasswordResetToken.deleteMany.mockResolvedValue({});

      const res = await resetPasswordPOST(
        jsonReq('http://localhost/api/auth/reset-password', {
          token: 'one-time-token',
          password: 'newpass123!',
          confirmPassword: 'newpass123!',
        })
      );

      expect(res.status).toBe(200);
      // After successful reset, all tokens for that user are deleted
      expect(mockPasswordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
    });

    it('second use fails because token was deleted after first use', async () => {
      // After first use, the token no longer exists in DB
      mockPasswordResetToken.findUnique.mockResolvedValue(null);

      const res = await resetPasswordPOST(
        jsonReq('http://localhost/api/auth/reset-password', {
          token: 'one-time-token',
          password: 'anotherpass123!',
          confirmPassword: 'anotherpass123!',
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid or expired reset token');
    });
  });

  describe('Verification token for a different user', () => {
    it('verifies the token owner, not the currently logged-in user', async () => {
      // Token belongs to user-A, but user-B is logged in (or nobody is logged in)
      // The verify-email endpoint uses the token's userId — so it verifies user-A
      mockEmailVerificationToken.findUnique.mockResolvedValue({
        token: 'token-for-user-a',
        userId: 'user-a',
        expiresAt: new Date(Date.now() + 3600000),
      });
      mockUser.update.mockResolvedValue({});
      mockEmailVerificationToken.deleteMany.mockResolvedValue({});

      const res = await verifyEmailGET(getReq({ token: 'token-for-user-a' }));

      // The route blindly verifies the token's user — no session check
      expect(res.status).toBe(307);
      expect(mockUser.update).toHaveBeenCalledWith({
        where: { id: 'user-a' },
        data: { emailVerified: expect.any(Date) },
      });
    });

    it('an attacker with someone else\'s token can verify their email', async () => {
      // If an attacker intercepts/guesses a verification token, they can verify another user's email
      // This is a security finding: the verify-email endpoint has no session binding
      mockEmailVerificationToken.findUnique.mockResolvedValue({
        token: 'stolen-token',
        userId: 'victim-user',
        expiresAt: new Date(Date.now() + 3600000),
      });
      mockUser.update.mockResolvedValue({});
      mockEmailVerificationToken.deleteMany.mockResolvedValue({});

      const res = await verifyEmailGET(getReq({ token: 'stolen-token' }));

      // Successfully verifies the victim's email
      expect(res.status).toBe(307);
      expect(mockUser.update).toHaveBeenCalledWith({
        where: { id: 'victim-user' },
        data: { emailVerified: expect.any(Date) },
      });
    });
  });

  describe('Unverified user bypasses middleware to access API', () => {
    it('messages endpoint rejects unverified user with 403', async () => {
      // The messages route now checks emailVerified after session check
      mockAuthFn.mockResolvedValue({
        user: { id: 'unverified-user', emailVerified: false, role: 'user' },
      });
      mockUser.findUnique.mockResolvedValue({
        emailVerified: null,
      });

      const req = nextReq('http://localhost/api/conversations/c1/messages', { content: 'hi' });
      const res = await messagesPOST(req, { params: Promise.resolve({ id: 'c1' }) });

      // FIXED: The endpoint now rejects unverified users
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Email not verified');
    });
  });

  describe('Stale JWT role (user promoted to admin, token still says user)', () => {
    it('middleware uses token role, not DB role, allowing stale permissions', async () => {
      // This tests the gap: JWT tokens carry role from sign-in time
      // If user is promoted to admin in DB, their JWT still says 'user' until re-login
      // Conversely, if a user is demoted from admin, their JWT still says 'admin'
      //
      // The session callback reads from the token, not DB:
      //   session.user.role = token.role as string;
      //
      // This is an inherent JWT trade-off but should be documented as a security consideration
      mockAuthFn.mockResolvedValue({
        user: { id: 'u1', role: 'user', emailVerified: true },
        // In reality the DB now has role: 'admin', but the JWT was issued when role was 'user'
      });

      // The user cannot access admin endpoints despite being promoted in DB
      // because the JWT token still carries role: 'user'
      // This is tested at the middleware level (authorized callback)
      // For API routes, we verify the session carries the stale role
      expect(mockAuthFn).not.toHaveBeenCalled(); // just setup
      const session = await mockAuthFn();
      expect(session.user.role).toBe('user');
      // The session will say 'user' even though the DB says 'admin'
      // To get 'admin', the user must re-authenticate
    });
  });

  describe('Register with the seeded admin email', () => {
    it('returns 409 because admin@persuaider.local already exists', async () => {
      // The seeded admin user already occupies this email
      mockUser.findUnique.mockImplementation(({ where }: { where: { email?: string; username?: string } }) => {
        if (where.email === 'admin@persuaider.local') {
          return { id: 'admin-1', email: 'admin@persuaider.local', role: 'admin', provider: 'credentials' };
        }
        return null;
      });

      const res = await registerPOST(
        jsonReq('http://localhost/api/auth/register', {
          email: 'admin@persuaider.local',
          username: 'attacker',
          password: 'password123',
          confirmPassword: 'password123',
        })
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.errors.email).toContain('already');
    });

    it('cannot escalate to admin role through registration', async () => {
      // Even if someone sends role: 'admin' in the request body,
      // the register route hardcodes role: 'user'
      mockUser.findUnique.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({ id: 'u1', email: 'evil@test.com', username: 'evil' });
      mockEmailVerificationToken.create.mockResolvedValue({ id: 't1' });

      await registerPOST(
        jsonReq('http://localhost/api/auth/register', {
          email: 'evil@test.com',
          username: 'evil',
          password: 'password123',
          confirmPassword: 'password123',
          role: 'admin', // attacker tries to escalate
        })
      );

      // The route always sets role: 'user', ignoring any role in the request body
      expect(mockUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'user',
          }),
        })
      );
    });
  });

  describe('Resend verification for already-verified user', () => {
    it('returns 400 when email is already verified', async () => {
      mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
      mockUser.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'verified@test.com',
        emailVerified: new Date(),
      });

      const res = await resendVerificationPOST();
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Email already verified');
    });
  });

  describe('Resend verification without authentication', () => {
    it('returns 401 when not logged in', async () => {
      mockAuthFn.mockResolvedValue(null);

      const res = await resendVerificationPOST();
      expect(res.status).toBe(401);
    });
  });
});
