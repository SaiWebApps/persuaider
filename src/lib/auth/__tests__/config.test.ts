// Polyfill Response.redirect for JSDOM environment
if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status || 200;
      this.headers = new Map(Object.entries(init?.headers || {}));
    }
    static redirect(url: string | URL) {
      const r = new Response(null, { status: 302, headers: { location: url.toString() } });
      return r;
    }
  } as unknown as typeof globalThis.Response;
}

// Declare mocks at module scope — jest.mock factories are hoisted above these
let _mockFindUnique: jest.Mock;
let _mockCompare: jest.Mock;

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: { findUnique: (...args: unknown[]) => _mockFindUnique(...args) } };
  },
}));

jest.mock('bcryptjs', () => ({
  compare: (...args: unknown[]) => _mockCompare(...args),
}));

jest.mock('next-auth/providers/credentials', () => {
  return function Credentials(config: Record<string, unknown>) {
    return { id: 'credentials', name: 'Credentials', type: 'credentials', options: config };
  };
});

jest.mock('next-auth/providers/google', () => {
  return function Google(config: Record<string, unknown>) {
    return { id: 'google', name: 'Google', type: 'oidc', options: config };
  };
});

jest.mock('next-auth/providers/microsoft-entra-id', () => {
  return function MicrosoftEntraID(config: Record<string, unknown>) {
    return { id: 'microsoft-entra-id', name: 'Microsoft Entra ID', type: 'oidc', options: config };
  };
});

import { authConfig } from '../config';

beforeEach(() => {
  _mockFindUnique = jest.fn();
  _mockCompare = jest.fn();
});

// Note: authorized callback was moved to src/middleware.ts (lightweight edge function).
// Auth routing tests are now covered by Playwright E2E tests.

describe('jwt callback', () => {
  const jwt = authConfig.callbacks!.jwt! as (args: {
    token: Record<string, unknown>;
    user?: { id?: string; role?: string; email?: string };
    account?: { provider: string; providerAccountId?: string } | null;
  }) => Promise<Record<string, unknown>>;

  it('sets id and role from user on credentials sign-in', async () => {
    const result = await jwt({ token: {}, user: { id: 'u1', role: 'admin' }, account: { provider: 'credentials' } });
    expect(result.id).toBe('u1');
    expect(result.role).toBe('admin');
  });

  it('defaults role to user when not provided', async () => {
    const result = await jwt({ token: {}, user: { id: 'u1' }, account: { provider: 'credentials' } });
    expect(result.role).toBe('user');
  });

  it('preserves token on subsequent calls', async () => {
    const result = await jwt({ token: { id: 'u1', role: 'admin' } });
    expect(result.id).toBe('u1');
  });
});

describe('session callback', () => {
  const session = authConfig.callbacks!.session! as (args: {
    session: { user: Record<string, unknown> };
    token: Record<string, unknown>;
  }) => { user: Record<string, unknown> };

  it('copies id and role from token to session', () => {
    const result = session({
      session: { user: { name: 'Test' } },
      token: { id: 'u1', role: 'admin' },
    });
    expect(result.user.id).toBe('u1');
    expect(result.user.role).toBe('admin');
    expect(result.user.name).toBe('Test');
  });
});

describe('authorize credentials', () => {
  let authorize: (credentials: Record<string, unknown> | undefined) => Promise<unknown>;

  beforeAll(() => {
    const provider = authConfig.providers[0] as unknown as {
      options?: { authorize: typeof authorize };
    };
    authorize = provider.options!.authorize;
  });

  it('rejects missing credentials', async () => {
    expect(await authorize(undefined)).toBeNull();
  });

  it('rejects missing email', async () => {
    expect(await authorize({ password: 'p' })).toBeNull();
  });

  it('rejects missing password', async () => {
    expect(await authorize({ email: 'e@e.com' })).toBeNull();
  });

  it('rejects unknown user', async () => {
    _mockFindUnique.mockResolvedValue(null);
    expect(await authorize({ email: 'e@e.com', password: 'p' })).toBeNull();
  });

  it('rejects user with no password hash', async () => {
    _mockFindUnique.mockResolvedValue({ id: 'u1', passwordHash: null });
    expect(await authorize({ email: 'e@e.com', password: 'p' })).toBeNull();
  });

  it('rejects wrong password', async () => {
    _mockFindUnique.mockResolvedValue({ id: 'u1', email: 'e@e.com', passwordHash: 'h', username: 'u', role: 'user' });
    _mockCompare.mockResolvedValue(false);
    expect(await authorize({ email: 'e@e.com', password: 'wrong' })).toBeNull();
  });

  it('returns user on valid credentials', async () => {
    _mockFindUnique.mockResolvedValue({ id: 'u1', email: 'test@t.com', passwordHash: 'h', username: 'tester', role: 'admin' });
    _mockCompare.mockResolvedValue(true);
    const result = await authorize({ email: 'test@t.com', password: 'ok' });
    expect(result).toEqual({ id: 'u1', name: 'tester', email: 'test@t.com', role: 'admin' });
  });
});
