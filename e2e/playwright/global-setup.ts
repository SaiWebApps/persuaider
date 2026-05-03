/**
 * Playwright Global Setup
 *
 * Runs before any test files. Validates ALL configured LLM provider keys
 * (not just the first working one), then re-seeds the database.
 */

import { execSync } from 'child_process';
import { checkLLMHealth } from './health-check';

export default async function globalSetup() {
  const result = await checkLLMHealth();

  // Report status for every provider
  for (const p of result.providers) {
    const icon = p.status === 'pass' ? '✅' : p.status === 'fail' ? '❌' : '⬚';
    const detail = p.status === 'not_configured' ? 'not configured' : p.status === 'pass' ? 'OK' : p.error;
    console.log(`  ${icon} ${p.name}: ${detail}`);
  }

  if (!result.anyAvailable) {
    console.error('\n❌ No working LLM provider. E2E tests cannot run.');
    console.error('   Add a valid API key to .env.local and try again.\n');
    process.exit(1);
  }

  if (!result.allConfiguredPass) {
    console.error('\n⚠️  Some configured LLM keys are broken:');
    for (const p of result.providers.filter(p => p.status === 'fail')) {
      console.error(`   ❌ ${p.name} (${p.envVar}): ${p.error}`);
    }
    console.error('   Fix these keys. Proceeding with working providers.\n');
  }

  // Re-seed database for clean test state
  console.log('\nRe-seeding database for E2E tests...');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });
}
