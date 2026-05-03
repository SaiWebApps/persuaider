/**
 * Production Smoke Test
 *
 * Runs against the live deployment URL to verify critical flows work.
 * This catches deployment-specific issues that unit tests can't:
 * - Database connection failures (wrong DATABASE_URL, missing params)
 * - Missing or wrong environment variables
 * - OAuth provider misconfiguration
 * - Middleware redirect loops
 *
 * Run: PRODUCTION_URL=https://persuaider.vercel.app npx tsx e2e/smoke/production.ts
 */

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://persuaider.vercel.app';
const TIMEOUT_MS = 10000;

interface TestResult {
  name: string;
  status: 'pass' | 'fail';
  detail?: string;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Login page loads
  try {
    const res = await fetchWithTimeout(`${PRODUCTION_URL}/login`);
    if (res.status === 200) {
      results.push({ name: 'Login page loads', status: 'pass' });
    } else {
      results.push({ name: 'Login page loads', status: 'fail', detail: `Status ${res.status}` });
    }
  } catch (err) {
    results.push({ name: 'Login page loads', status: 'fail', detail: String(err) });
  }

  // Test 2: Auth providers endpoint returns configured providers
  try {
    const res = await fetchWithTimeout(`${PRODUCTION_URL}/api/auth/providers`);
    if (res.status === 200) {
      const data = await res.json();
      const providers = Object.keys(data);
      if (providers.includes('credentials')) {
        results.push({ name: 'Credentials provider configured', status: 'pass' });
      } else {
        results.push({ name: 'Credentials provider configured', status: 'fail', detail: `Providers: ${providers.join(', ')}` });
      }
      if (providers.includes('google')) {
        results.push({ name: 'Google OAuth provider configured', status: 'pass' });
      } else {
        results.push({ name: 'Google OAuth provider configured', status: 'fail', detail: 'Google not in providers list' });
      }
    } else {
      results.push({ name: 'Auth providers endpoint', status: 'fail', detail: `Status ${res.status}` });
    }
  } catch (err) {
    results.push({ name: 'Auth providers endpoint', status: 'fail', detail: String(err) });
  }

  // Test 3: Credentials login against DB (proves DB connection works)
  try {
    // First get CSRF token and capture the set-cookie header
    const csrfRes = await fetchWithTimeout(`${PRODUCTION_URL}/api/auth/csrf`);
    const { csrfToken } = await csrfRes.json();
    const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];
    const cookieHeader = csrfCookies.map(c => c.split(';')[0]).join('; ');

    const res = await fetchWithTimeout(`${PRODUCTION_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: new URLSearchParams({
        csrfToken,
        email: 'demo@persuaider.com',
        password: 'demo123',
      }).toString(),
    });

    // NextAuth returns 302 redirect on success, 401 or 200-with-error on failure
    if (res.status === 302 || res.status === 200) {
      const location = res.headers.get('location') || '';
      if (location.includes('error')) {
        results.push({ name: 'Credentials login (DB connection)', status: 'fail', detail: `Redirect to error: ${location}` });
      } else {
        results.push({ name: 'Credentials login (DB connection)', status: 'pass' });
      }
    } else {
      results.push({ name: 'Credentials login (DB connection)', status: 'fail', detail: `Status ${res.status}` });
    }
  } catch (err) {
    results.push({ name: 'Credentials login (DB connection)', status: 'fail', detail: String(err) });
  }

  // Test 4: Google OAuth initiates correctly (should redirect to Google)
  try {
    // Initiate OAuth via POST with CSRF token (NextAuth v5 requires this)
    const csrfRes = await fetchWithTimeout(`${PRODUCTION_URL}/api/auth/csrf`);
    const { csrfToken } = await csrfRes.json();
    const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];
    const cookieHeader = csrfCookies.map(c => c.split(';')[0]).join('; ');

    const res = await fetchWithTimeout(`${PRODUCTION_URL}/api/auth/signin/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: new URLSearchParams({ csrfToken }).toString(),
    });
    // Should redirect (302) to accounts.google.com
    if (res.status === 302) {
      const location = res.headers.get('location') || '';
      if (location.includes('accounts.google.com')) {
        results.push({ name: 'Google OAuth redirect', status: 'pass' });
      } else {
        results.push({ name: 'Google OAuth redirect', status: 'fail', detail: `Redirects to: ${location}` });
      }
    } else {
      results.push({ name: 'Google OAuth redirect', status: 'fail', detail: `Status ${res.status}, expected 302` });
    }
  } catch (err) {
    results.push({ name: 'Google OAuth redirect', status: 'fail', detail: String(err) });
  }

  // Test 5: Protected route redirects to login when not authenticated
  try {
    const res = await fetchWithTimeout(`${PRODUCTION_URL}/dashboard`);
    if (res.status === 307 || res.status === 302) {
      const location = res.headers.get('location') || '';
      if (location.includes('/login')) {
        results.push({ name: 'Protected route redirect', status: 'pass' });
      } else {
        results.push({ name: 'Protected route redirect', status: 'fail', detail: `Redirects to: ${location}` });
      }
    } else {
      results.push({ name: 'Protected route redirect', status: 'fail', detail: `Status ${res.status}, expected redirect` });
    }
  } catch (err) {
    results.push({ name: 'Protected route redirect', status: 'fail', detail: String(err) });
  }

  return results;
}

// Run
(async () => {
  console.log(`Production Smoke Test: ${PRODUCTION_URL}`);
  console.log('='.repeat(50));
  console.log('');

  const results = await runTests();
  let failures = 0;

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    if (r.status === 'fail') failures++;
  }

  console.log('');
  if (failures === 0) {
    console.log(`Result: ALL ${results.length} checks passed.`);
    process.exit(0);
  } else {
    console.log(`Result: ${failures}/${results.length} checks FAILED.`);
    process.exit(1);
  }
})();
