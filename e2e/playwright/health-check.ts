/**
 * LLM Health Check
 *
 * Validates EVERY configured LLM provider key individually.
 * A dead key in the fallback chain is a silent bug — this catches it.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface ProviderStatus {
  name: string;
  envVar: string;
  status: 'pass' | 'fail' | 'not_configured';
  error?: string;
}

export interface HealthCheckResult {
  allConfiguredPass: boolean;
  anyAvailable: boolean;
  providers: ProviderStatus[];
}

interface ProviderConfig {
  name: string;
  envVar: string;
  check: (key: string, signal: AbortSignal) => Promise<void>;
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
    // File doesn't exist or can't be read
  }
  return env;
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

const PROVIDERS: ProviderConfig[] = [
  { name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', check: checkAnthropic },
  { name: 'Gemini', envVar: 'GOOGLE_GEMINI_API_KEY', check: checkGemini },
  { name: 'OpenAI', envVar: 'OPENAI_API_KEY', check: checkOpenAI },
];

const TIMEOUT_MS = 5000;

export async function checkLLMHealth(): Promise<HealthCheckResult> {
  const envPath = resolve(__dirname, '../../.env.local');
  const env = parseEnvFile(envPath);

  const providers: ProviderStatus[] = [];

  // Check EVERY provider, not just the first one that works
  for (const provider of PROVIDERS) {
    const key = env[provider.envVar];
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

// Standalone execution: `npx tsx e2e/playwright/health-check.ts`
if (require.main === module) {
  (async () => {
    console.log('LLM Provider Health Check');
    console.log('=========================\n');

    const result = await checkLLMHealth();

    for (const p of result.providers) {
      const icon = p.status === 'pass' ? '✅' : p.status === 'fail' ? '❌' : '⬚';
      const detail = p.status === 'not_configured' ? 'not configured' : p.status === 'pass' ? 'OK' : p.error;
      console.log(`  ${icon} ${p.name} (${p.envVar}): ${detail}`);
    }

    console.log('');

    if (result.allConfiguredPass) {
      console.log('Result: ALL configured providers are healthy.');
      process.exit(0);
    } else if (result.anyAvailable) {
      console.log('Result: DEGRADED — some configured providers are broken:');
      for (const p of result.providers.filter(p => p.status === 'fail')) {
        console.log(`  ❌ ${p.name}: ${p.error}`);
      }
      console.log('\nThe app will work via fallback, but fix the broken keys.');
      process.exit(1);
    } else {
      console.log('Result: FAIL — no working LLM provider.');
      console.log('Add a valid API key to .env.local and try again.');
      process.exit(1);
    }
  })();
}
