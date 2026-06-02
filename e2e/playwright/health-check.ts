/**
 * E2E Health Check — Single Source of Truth
 *
 * Validates ALL prerequisites before E2E tests run:
 * 1. .env.local exists with required keys
 * 2. Clerk Backend API key is valid
 * 3. Test users exist (auto-creates if missing)
 * 4. At least one LLM provider key works
 * 5. Playwright browsers are installed
 *
 * Run standalone: npx tsx e2e/playwright/health-check.ts
 * Run via Make:   make test-health
 *
 * Exit 0 = all good. Exit 1 = clear error with fix instructions.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProviderStatus {
  name: string;
  envVar: string;
  status: 'pass' | 'fail' | 'not_configured';
  error?: string;
}

export interface ClerkStatus {
  valid: boolean;
  error?: string;
}

export interface TestUsersStatus {
  demo: boolean;
  admin: boolean;
  created: string[];
}

export interface PlaywrightStatus {
  installed: boolean;
  error?: string;
}

export interface HealthCheckResult {
  env: { exists: boolean; missingKeys: string[] };
  clerk: ClerkStatus;
  testUsers: TestUsersStatus;
  llm: { allConfiguredPass: boolean; anyAvailable: boolean; providers: ProviderStatus[] };
  playwright: PlaywrightStatus;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5000;
const PROJECT_ROOT = resolve(__dirname, '../..');
const ENV_PATH = resolve(PROJECT_ROOT, '.env.local');

const TEST_USERS = [
  { email: 'demo@persuaider.com', password: 'TestPass123!', role: 'user' },
  { email: 'admin@persuaider.dev', password: 'AdminPass123!', role: 'admin' },
];

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
    // File doesn't exist or can't be read
  }
  return env;
}

// ─── Check: .env.local ──────────────────────────────────────────────────────

function checkEnvFile(): { exists: boolean; missingKeys: string[] } {
  if (!existsSync(ENV_PATH)) {
    return { exists: false, missingKeys: ['CLERK_SECRET_KEY'] };
  }
  const env = parseEnvFile(ENV_PATH);
  const required = ['CLERK_SECRET_KEY'];
  const missing = required.filter(k => !env[k] || env[k].trim() === '');
  return { exists: true, missingKeys: missing };
}

// ─── Check: Clerk Backend API ───────────────────────────────────────────────

export async function checkClerk(): Promise<ClerkStatus> {
  const env = parseEnvFile(ENV_PATH);
  const key = env['CLERK_SECRET_KEY'] || process.env.CLERK_SECRET_KEY;

  if (!key || key.trim() === '') {
    return { valid: false, error: 'CLERK_SECRET_KEY not set in .env.local' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.clerk.com/v1/users?limit=1', {
      method: 'GET',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}` },
    });
    clearTimeout(timeout);

    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: `Clerk API returned ${res.status}. Key is invalid or revoked.` };
    }
    if (res.status === 404) {
      return { valid: false, error: 'Clerk API returned 404. Instance may be deleted.' };
    }
    if (!res.ok) {
      return { valid: false, error: `Clerk API returned HTTP ${res.status}` };
    }
    return { valid: true };
  } catch (err: unknown) {
    clearTimeout(timeout);
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Clerk API unreachable (timeout 5s)'
          : err.message
        : String(err);
    return { valid: false, error: message };
  }
}

// ─── Check: Test Users (auto-create if missing) ─────────────────────────────

async function findUserByEmail(key: string, email: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
      {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}` },
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function createTestUser(
  key: string,
  email: string,
  password: string,
  role: string
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch('https://api.clerk.com/v1/users', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: [email],
        password,
        public_metadata: { role },
        skip_password_checks: true,
      }),
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureTestUsers(): Promise<TestUsersStatus> {
  const env = parseEnvFile(ENV_PATH);
  const key = env['CLERK_SECRET_KEY'] || process.env.CLERK_SECRET_KEY;

  if (!key || key.trim() === '') {
    return { demo: false, admin: false, created: [] };
  }

  const result: TestUsersStatus = { demo: false, admin: false, created: [] };

  for (const user of TEST_USERS) {
    const exists = await findUserByEmail(key, user.email);
    const label = user.email.includes('demo') ? 'demo' : 'admin';

    if (exists) {
      result[label] = true;
    } else {
      // Auto-create the test user
      const created = await createTestUser(key, user.email, user.password, user.role);
      if (created) {
        result[label] = true;
        result.created.push(user.email);
      }
    }
  }

  return result;
}

// ─── Check: LLM Providers ───────────────────────────────────────────────────

interface LLMProviderConfig {
  name: string;
  envVar: string;
  check: (key: string, signal: AbortSignal) => Promise<void>;
}

async function checkAnthropic(key: string, signal: AbortSignal): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
}

async function checkOpenAI(key: string, signal: AbortSignal): Promise<void> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
}

async function checkGemini(key: string, signal: AbortSignal): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'hi' }] }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
}

const LLM_PROVIDERS: LLMProviderConfig[] = [
  { name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', check: checkAnthropic },
  { name: 'Gemini', envVar: 'GOOGLE_GEMINI_API_KEY', check: checkGemini },
  { name: 'OpenAI', envVar: 'OPENAI_API_KEY', check: checkOpenAI },
];

export async function checkLLMHealth(): Promise<{
  allConfiguredPass: boolean;
  anyAvailable: boolean;
  providers: ProviderStatus[];
}> {
  const env = parseEnvFile(ENV_PATH);
  const providers: ProviderStatus[] = [];

  for (const provider of LLM_PROVIDERS) {
    const key = env[provider.envVar] || process.env[provider.envVar];
    if (!key || key.trim() === '') {
      providers.push({ name: provider.name, envVar: provider.envVar, status: 'not_configured' });
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      await provider.check(key, controller.signal);
      clearTimeout(timeout);
      providers.push({ name: provider.name, envVar: provider.envVar, status: 'pass' });
    } catch (err: unknown) {
      clearTimeout(timeout);
      const message =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Request timed out (5s)'
            : err.message
          : String(err);
      providers.push({ name: provider.name, envVar: provider.envVar, status: 'fail', error: message });
    }
  }

  const configured = providers.filter(p => p.status !== 'not_configured');
  const allConfiguredPass = configured.length > 0 && configured.every(p => p.status === 'pass');
  const anyAvailable = configured.some(p => p.status === 'pass');

  return { allConfiguredPass, anyAvailable, providers };
}

// ─── Check: Playwright Browsers ─────────────────────────────────────────────

export function checkPlaywright(): PlaywrightStatus {
  try {
    // Check if chromium is installed by looking for the browser directory
    const output = execSync('npx playwright install --dry-run chromium 2>&1', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 10000,
    });
    // If dry-run says nothing to install, browsers are present
    if (output.includes('browser is already installed') || output.includes('already installed')) {
      return { installed: true };
    }
    // If we get here without error, try the version check approach
    execSync('npx playwright --version', { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 10000 });
    return { installed: true };
  } catch {
    // Fall back to checking if playwright can locate chromium
    try {
      execSync(
        'node -e "const {chromium}=require(\'playwright\');chromium.executablePath()"',
        { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 10000 }
      );
      return { installed: true };
    } catch {
      return { installed: false, error: 'Playwright chromium browser not found' };
    }
  }
}

export function installPlaywright(): boolean {
  try {
    console.log('  Installing Playwright chromium browser...');
    execSync('npx playwright install chromium', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: 'inherit',
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Main: Run All Checks ───────────────────────────────────────────────────

export async function runHealthCheck(): Promise<HealthCheckResult> {
  const env = checkEnvFile();
  const clerk = await checkClerk();
  const testUsers = clerk.valid ? await ensureTestUsers() : { demo: false, admin: false, created: [] };
  const llm = await checkLLMHealth();
  const playwright = checkPlaywright();

  return { env, clerk, testUsers, llm, playwright };
}

// ─── Standalone Execution ───────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    console.log('');
    console.log('E2E Prerequisites Health Check');
    console.log('==============================');
    console.log('');

    let failures = 0;

    // 1. .env.local
    console.log('[1/5] Environment file (.env.local)');
    const envCheck = checkEnvFile();
    if (!envCheck.exists) {
      console.log('  FAIL: .env.local does not exist');
      console.log('  Fix:  Run "make init-env" to create it, then add your keys.');
      failures++;
    } else if (envCheck.missingKeys.length > 0) {
      console.log(`  FAIL: Missing required keys: ${envCheck.missingKeys.join(', ')}`);
      console.log('  Fix:  Run "make clerk-setup" OR manually add these to .env.local');
      failures++;
    } else {
      console.log('  OK');
    }
    console.log('');

    // 2. Clerk Backend API
    console.log('[2/5] Clerk Backend API');
    const clerkCheck = await checkClerk();
    if (!clerkCheck.valid) {
      console.log(`  FAIL: ${clerkCheck.error}`);
      console.log('  Fix:  Run "make clerk-setup" OR update CLERK_SECRET_KEY in .env.local');
      failures++;
    } else {
      console.log('  OK: Clerk API reachable and key valid');
    }
    console.log('');

    // 3. Test users
    console.log('[3/5] Test Users');
    if (!clerkCheck.valid) {
      console.log('  SKIP: Cannot check users — Clerk key invalid');
    } else {
      const usersCheck = await ensureTestUsers();
      if (usersCheck.created.length > 0) {
        console.log(`  OK: Auto-created missing test users: ${usersCheck.created.join(', ')}`);
      }
      if (!usersCheck.demo) {
        console.log('  FAIL: demo@persuaider.com not found and could not be created');
        failures++;
      } else if (!usersCheck.created.includes('demo@persuaider.com')) {
        console.log('  OK: demo@persuaider.com exists');
      }
      if (!usersCheck.admin) {
        console.log('  FAIL: admin@persuaider.dev not found and could not be created');
        failures++;
      } else if (!usersCheck.created.includes('admin@persuaider.dev')) {
        console.log('  OK: admin@persuaider.dev exists');
      }
    }
    console.log('');

    // 4. LLM Providers
    console.log('[4/5] LLM Providers');
    const llmCheck = await checkLLMHealth();
    for (const p of llmCheck.providers) {
      const icon = p.status === 'pass' ? 'OK' : p.status === 'fail' ? 'FAIL' : 'NOT SET';
      const detail =
        p.status === 'not_configured'
          ? `${p.envVar} not set`
          : p.status === 'pass'
            ? 'healthy'
            : p.error;
      console.log(`  ${icon}: ${p.name} (${p.envVar}) — ${detail}`);
    }
    if (!llmCheck.anyAvailable) {
      console.log('  FAIL: No working LLM provider. At least one is required.');
      console.log('  Fix:  Add a valid API key to .env.local (ANTHROPIC_API_KEY, GOOGLE_GEMINI_API_KEY, or OPENAI_API_KEY)');
      failures++;
    }
    console.log('');

    // 5. Playwright browsers
    console.log('[5/5] Playwright Browsers');
    let pwCheck = checkPlaywright();
    if (!pwCheck.installed) {
      console.log('  NOT FOUND: Chromium browser not installed. Attempting auto-install...');
      const installed = installPlaywright();
      if (installed) {
        console.log('  OK: Playwright chromium installed successfully');
        pwCheck = { installed: true };
      } else {
        console.log('  FAIL: Could not install Playwright browsers');
        console.log('  Fix:  Run "npx playwright install chromium" manually');
        failures++;
      }
    } else {
      console.log('  OK: Playwright chromium available');
    }
    console.log('');

    // Summary
    console.log('─'.repeat(50));
    if (failures === 0) {
      console.log('RESULT: All E2E prerequisites are healthy.');
      console.log('');
      process.exit(0);
    } else {
      console.log(`RESULT: ${failures} check(s) failed. Fix the issues above before running E2E tests.`);
      console.log('');
      process.exit(1);
    }
  })();
}
