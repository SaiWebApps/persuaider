/**
 * Playwright Global Setup
 *
 * Runs before any test files. First verifies LLM provider connectivity
 * so tests fail fast with a clear message instead of timing out silently,
 * then re-seeds the database.
 */

import { execSync } from 'child_process';
import { checkLLMHealth } from './health-check';

export default async function globalSetup() {
  // Health check first — fail fast if no LLM provider is reachable
  const result = await checkLLMHealth();

  if (!result.available) {
    console.error('\n❌ LLM Health Check Failed');
    for (const err of result.errors) console.error('   ' + err);
    console.error(
      '\n   E2E tests require at least one working LLM provider.'
    );
    console.error('   Add a valid API key to .env.local and try again.\n');
    process.exit(1);
  }

  console.log(
    `✅ LLM Health Check Passed (provider: ${result.provider})`
  );

  // Re-seed database for clean test state
  console.log('\nRe-seeding database for E2E tests...');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
}
