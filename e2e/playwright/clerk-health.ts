/**
 * Clerk Auth Health Check
 *
 * Validates that Clerk API keys are valid and the service is reachable.
 * Blocks deployment if Clerk is down or misconfigured.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface ClerkHealthResult {
  status: 'pass' | 'fail' | 'not_configured';
  error?: string;
}

function parseEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z_0-9]*)=(.*)$/);
      if (match) {
        let value = match[2];
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        env[match[1]] = value;
      }
    }
  } catch {
    // File doesn't exist
  }
  return env;
}

const TIMEOUT_MS = 5000;

export async function checkClerkHealth(): Promise<ClerkHealthResult> {
  const envPath = resolve(__dirname, '../../.env.local');
  const env = parseEnvFile(envPath);

  const secretKey = env['CLERK_SECRET_KEY'] || process.env.CLERK_SECRET_KEY;

  if (!secretKey || secretKey.trim() === '') {
    return { status: 'not_configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('https://api.clerk.com/v1/users?limit=1', {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });
    clearTimeout(timeout);

    if (response.status === 401) {
      return { status: 'fail', error: 'CLERK_SECRET_KEY is invalid (401 Unauthorized)' };
    }
    if (!response.ok) {
      return { status: 'fail', error: `Clerk API returned HTTP ${response.status}` };
    }
    return { status: 'pass' };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Clerk API unreachable (timeout 5s)'
          : err.message
        : String(err);
    return { status: 'fail', error: message };
  }
}

if (require.main === module) {
  (async () => {
    console.log('Clerk Auth Health Check');
    console.log('=======================\n');

    const result = await checkClerkHealth();

    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⬚';
    const detail =
      result.status === 'not_configured'
        ? 'CLERK_SECRET_KEY not set'
        : result.status === 'pass'
          ? 'OK — Clerk API reachable and key valid'
          : result.error;

    console.log(`  ${icon} Clerk: ${detail}`);
    console.log('');

    if (result.status === 'pass') {
      console.log('Result: Clerk auth is healthy.');
      process.exit(0);
    } else if (result.status === 'not_configured') {
      console.log('Result: SKIP — Clerk not configured yet.');
      console.log('Set CLERK_SECRET_KEY in .env.local to enable this check.');
      process.exit(0);
    } else {
      console.log('Result: FAIL — Clerk auth is broken.');
      console.log('Fix CLERK_SECRET_KEY in .env.local or check Clerk status page.');
      process.exit(1);
    }
  })();
}
