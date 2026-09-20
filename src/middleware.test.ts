/**
 * @jest-environment node
 */

/**
 * Unit tests for src/middleware.ts
 * Tests route protection logic: admin routes, protected routes, auth pages, and unmatched routes.
 */

const mockAuth = jest.fn();
const mockProtect = jest.fn();

jest.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (handler: (auth: () => unknown, req: Request) => unknown) => {
    return async (req: Request) => {
      const authObj = () => mockAuth();
      authObj.protect = mockProtect;
      return handler(authObj, req);
    };
  },
  createRouteMatcher: (patterns: string[]) => {
    return (req: { nextUrl?: { pathname: string }; url?: string }) => {
      const pathname = req.nextUrl?.pathname || new URL(req.url || '').pathname;
      return patterns.some((p) => {
        const regex = new RegExp('^' + p.replace('(.*)', '.*') + '$');
        return regex.test(pathname);
      });
    };
  },
}));

import middleware from './middleware';

function createRequest(pathname: string): Request {
  const url = `http://localhost:3000${pathname}`;
  const req = new Request(url, { method: 'GET' });
  // Add nextUrl for the createRouteMatcher mock
  const parsed = new URL(url);
  Object.defineProperty(req, 'nextUrl', {
    value: { pathname: parsed.pathname, searchParams: parsed.searchParams },
    writable: false,
  });
  return req;
}

describe('Middleware route protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Admin routes
  // -------------------------------------------------------------------------
  describe('admin routes (/admin/**)', () => {
    it('passes through when user has admin role', async () => {
      mockProtect.mockResolvedValue({
        sessionClaims: { metadata: { role: 'admin' } },
      });

      const req = createRequest('/admin/users');
      const result = await middleware(req);

      expect(mockProtect).toHaveBeenCalled();
      // No redirect returned — middleware passes through
      expect(result).toBeUndefined();
    });

    it('does not redirect on role: admin role is enforced by the admin layout and API routes, not here', async () => {
      mockProtect.mockResolvedValue({ sessionClaims: { metadata: { role: 'user' } } });

      const req = createRequest('/admin/analytics');
      const result = await middleware(req);

      expect(mockProtect).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('handles nested admin routes (/admin/users/123)', async () => {
      mockProtect.mockResolvedValue({
        sessionClaims: { metadata: { role: 'admin' } },
      });

      const req = createRequest('/admin/users/123');
      const result = await middleware(req);

      expect(mockProtect).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('calls auth.protect() for unauthenticated admin access', async () => {
      // auth.protect() would throw/redirect when not authenticated
      // In our mock, we simulate it being called and returning claims
      mockProtect.mockResolvedValue({
        sessionClaims: { metadata: { role: 'admin' } },
      });

      const req = createRequest('/admin');
      await middleware(req);

      expect(mockProtect).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Protected routes
  // -------------------------------------------------------------------------
  describe('protected routes (/dashboard/**, /persona/**)', () => {
    it('calls protect() for authenticated user on /dashboard', async () => {
      mockProtect.mockResolvedValue(undefined);

      const req = createRequest('/dashboard');
      const result = await middleware(req);

      expect(mockProtect).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('calls protect() for /persona routes', async () => {
      mockProtect.mockResolvedValue(undefined);

      const req = createRequest('/persona/select');
      const result = await middleware(req);

      expect(mockProtect).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('calls protect() for nested dashboard routes', async () => {
      mockProtect.mockResolvedValue(undefined);

      const req = createRequest('/dashboard/conversations/abc');
      const result = await middleware(req);

      expect(mockProtect).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Auth pages
  // -------------------------------------------------------------------------
  describe('auth pages (login, register, forgot-password, reset-password, verify-email)', () => {
    it('redirects to /dashboard when user is already logged in on /login', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      const req = createRequest('/login');
      const result = await middleware(req);

      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(302);
      expect(new URL(result!.headers.get('location')!).pathname).toBe('/dashboard');
    });

    it('honours a same-origin redirect_url when already logged in, and ignores an off-site one', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });

      const same = await middleware(createRequest('/register?redirect_url=%2Fs%2FEXAMPLE1%3Fjoin%3D1'));
      expect(new URL(same!.headers.get('location')!).pathname + new URL(same!.headers.get('location')!).search).toBe('/s/EXAMPLE1?join=1');

      const offsite = await middleware(createRequest('/login?redirect_url=https%3A%2F%2Fevil.example%2F'));
      expect(new URL(offsite!.headers.get('location')!).pathname).toBe('/dashboard');
    });

    it('passes through /login when user is not logged in', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const req = createRequest('/login');
      const result = await middleware(req);

      expect(result).toBeUndefined();
    });

    it('redirects to /dashboard from /register when logged in', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_456' });

      const req = createRequest('/register');
      const result = await middleware(req);

      expect(result).toBeInstanceOf(Response);
      expect(new URL(result!.headers.get('location')!).pathname).toBe('/dashboard');
    });

    it('passes through /register when not logged in', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const req = createRequest('/register');
      const result = await middleware(req);

      expect(result).toBeUndefined();
    });

    it('redirects to /dashboard from /forgot-password when logged in', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_789' });

      const req = createRequest('/forgot-password');
      const result = await middleware(req);

      expect(result).toBeInstanceOf(Response);
      expect(new URL(result!.headers.get('location')!).pathname).toBe('/dashboard');
    });

    it('passes through /forgot-password when not logged in', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const req = createRequest('/forgot-password');
      const result = await middleware(req);

      expect(result).toBeUndefined();
    });

    it('redirects to /dashboard from /reset-password when logged in', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_abc' });

      const req = createRequest('/reset-password');
      const result = await middleware(req);

      expect(result).toBeInstanceOf(Response);
      expect(new URL(result!.headers.get('location')!).pathname).toBe('/dashboard');
    });

    it('redirects to /dashboard from /verify-email when logged in', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_def' });

      const req = createRequest('/verify-email');
      const result = await middleware(req);

      expect(result).toBeInstanceOf(Response);
      expect(new URL(result!.headers.get('location')!).pathname).toBe('/dashboard');
    });

    it('does NOT redirect when userId is falsy empty string', async () => {
      mockAuth.mockResolvedValue({ userId: '' });

      const req = createRequest('/login');
      const result = await middleware(req);

      // Empty string is falsy, so no redirect
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Unmatched routes
  // -------------------------------------------------------------------------
  describe('unmatched routes (public, API, etc.)', () => {
    it('passes through for /api/something', async () => {
      const req = createRequest('/api/something');
      const result = await middleware(req);

      // protect should not be called for unmatched routes
      expect(mockProtect).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('passes through for root /', async () => {
      const req = createRequest('/');
      const result = await middleware(req);

      expect(mockProtect).not.toHaveBeenCalled();
      expect(mockAuth).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('passes through for /about', async () => {
      const req = createRequest('/about');
      const result = await middleware(req);

      expect(mockProtect).not.toHaveBeenCalled();
      expect(mockAuth).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('passes through for /api/webhooks/clerk', async () => {
      const req = createRequest('/api/webhooks/clerk');
      const result = await middleware(req);

      expect(mockProtect).not.toHaveBeenCalled();
      expect(mockAuth).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Adversarial inputs
  // -------------------------------------------------------------------------
  describe('adversarial inputs', () => {
    it('handles XSS payload in route path', async () => {
      const req = createRequest('/<script>alert("xss")</script>');
      const result = await middleware(req);

      // Does not match any route pattern - passes through
      expect(mockProtect).not.toHaveBeenCalled();
      expect(mockAuth).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('handles path traversal attempt', async () => {
      // Set up mockProtect in case the path matches admin route
      mockProtect.mockResolvedValue({
        sessionClaims: { metadata: { role: 'user' } },
      });

      const req = createRequest('/admin/../admin/users');
      const result = await middleware(req);

      // Depending on URL normalization, this may or may not match /admin
      // The key assertion is that it does not crash
      expect(result === undefined || result instanceof Response).toBe(true);
    });

    it('handles URL-encoded admin path', async () => {
      // /admin encoded as /%61dmin should NOT match the admin route pattern
      const req = createRequest('/%61dmin/users');
      const result = await middleware(req);

      // Passes through without triggering admin protection
      expect(result).toBeUndefined();
    });
  });
});

describe('Middleware config', () => {
  it('exports a valid matcher config', async () => {
    const { config } = await import('./middleware');
    expect(config).toBeDefined();
    expect(config.matcher).toBeDefined();
    expect(Array.isArray(config.matcher)).toBe(true);
    expect(config.matcher.length).toBeGreaterThan(0);
  });
});
