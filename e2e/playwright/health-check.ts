/**
 * LLM Health Check for Playwright E2E Tests
 *
 * Verifies that at least one LLM provider is accessible before running tests.
 * Prevents wasting 10+ minutes on silent timeouts when API keys are missing or invalid.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface HealthCheckResult {
  available: boolean;
  provider: string | null;
  errors: string[];
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
        // Strip surrounding quotes
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

  const errors: string[] = [];
  const configuredProviders: ProviderConfig[] = [];

  for (const provider of PROVIDERS) {
    const key = env[provider.envVar];
    if (!key || key.trim() === '') {
      errors.push(`${provider.name}: ${provider.envVar} not set or empty`);
    } else {
      configuredProviders.push(provider);
    }
  }

  if (configuredProviders.length === 0) {
    return { available: false, provider: null, errors };
  }

  // Try each configured provider. Return as soon as one succeeds.
  for (const provider of configuredProviders) {
    const key = env[provider.envVar]!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      await provider.check(key, controller.signal);
      clearTimeout(timeout);
      return { available: true, provider: provider.name, errors: [] };
    } catch (err: unknown) {
      clearTimeout(timeout);
      const message =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Request timed out (5s)'
            : err.message
          : String(err);
      errors.push(`${provider.name}: ${message}`);
    }
  }

  return { available: false, provider: null, errors };
}

// Allow standalone execution: `npx tsx e2e/playwright/health-check.ts`
if (require.main === module) {
  (async () => {
    console.log('LLM Health Check');
    console.log('================');
    console.log('');

    const result = await checkLLMHealth();

    if (result.available) {
      console.log(`Status: PASS`);
      console.log(`Provider: ${result.provider}`);
    } else {
      console.log(`Status: FAIL`);
      console.log('');
      console.log('Errors:');
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
      console.log('');
      console.log('E2E tests require at least one working LLM provider.');
      console.log('Add a valid API key to .env.local and try again.');
      process.exit(1);
    }
  })();
}
