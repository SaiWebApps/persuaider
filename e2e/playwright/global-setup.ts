/**
 * Playwright Global Setup
 *
 * Runs before any test files. Loads environment variables and re-seeds the database.
 *
 * NOTE: Health checks (Clerk, LLM, test users, browsers) are handled by the
 * Makefile prereq `ensure-e2e-env` which runs health-check.ts BEFORE Playwright
 * starts. This file only does runtime setup that requires the test harness.
 */

import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import { clerkSetup } from '@clerk/testing/playwright';
import { checkClerk, checkLLMHealth } from './health-check';

export default async function globalSetup() {
  // Load environment variables (Clerk keys, LLM keys, etc.)
  dotenv.config({ path: '.env.local', override: true });

  // Fetch the Clerk testing token (bypasses bot protection for automated browsers).
  // Required for the @clerk/testing signIn helper used in e2e/playwright/helpers.ts.
  await clerkSetup();

  // Quick sanity check — these should pass since ensure-e2e-env ran first,
  // but catch the case where someone runs `npx playwright test` directly.
  if (!process.env.CLERK_SECRET_KEY) {
    console.error('');
    console.error('ERROR: CLERK_SECRET_KEY not set (in .env.local locally, or as a secret in CI)');
    console.error('');
    console.error('  You are running Playwright directly without prerequisites.');
    console.error('  Use "make test-e2e-pw" instead, which handles all setup.');
    console.error('  Or run "make test-health" to diagnose what is missing.');
    console.error('');
    process.exit(1);
  }

  const clerkResult = await checkClerk();
  if (!clerkResult.valid) {
    console.error('');
    console.error(`ERROR: Clerk Backend API check failed: ${clerkResult.error}`);
    console.error('');
    console.error('  Fix: Run "make clerk-setup" OR update CLERK_SECRET_KEY in .env.local');
    console.error('');
    process.exit(1);
  }
  console.log('  Clerk: Backend API healthy');

  const llmResult = await checkLLMHealth();
  for (const p of llmResult.providers) {
    const icon = p.status === 'pass' ? 'OK' : p.status === 'fail' ? 'FAIL' : 'SKIP';
    const detail =
      p.status === 'not_configured' ? 'not configured' : p.status === 'pass' ? 'healthy' : p.error;
    console.log(`  ${p.name}: ${icon} — ${detail}`);
  }

  if (!llmResult.anyAvailable) {
    console.error('');
    console.error('ERROR: No working LLM provider. E2E tests cannot run.');
    console.error('  Add a valid API key to .env.local and try again.');
    console.error('');
    process.exit(1);
  }

  // Re-seed database for clean test state
  console.log('');
  console.log('  Re-seeding database for E2E tests...');
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit' });

  // Link seeded DB users to their Clerk identities. getAuthSession() (src/lib/auth/clerk.ts)
  // resolves the signed-in user by clerkId; the Clerk webhook that normally sets it does not
  // fire in the local test environment, so we link the e2e test users here.
  console.log('  Linking test users to Clerk identities...');
  const { createClerkClient } = await import('@clerk/backend');
  const { PrismaClient } = await import('@prisma/client');
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const db = new PrismaClient();
  try {
    // The Clerk development instance allows 100 users. Every run signs up throwaway
    // users (+clerk_test sign-ups, admin-created testuser-*@test.com); remove the ones
    // left by earlier runs so the cap is never hit.
    let removedUsers = 0;
    try {
      for (let offset = 0; ; ) {
        const page = await clerkClient.users.getUserList({ limit: 100, offset });
        for (const u of page.data) {
          const throwaway = u.emailAddresses.some((e) => /\+clerk_test/i.test(e.emailAddress) || /^testuser-\d+@test\.com$/i.test(e.emailAddress));
          if (!throwaway) {
            offset++;
            continue;
          }
          try {
            await clerkClient.users.deleteUser(u.id);
            removedUsers++;
          } catch {
            // transient Clerk error: leave it for the next run
          }
          await new Promise((r) => setTimeout(r, 200));
        }
        if (page.data.length < 100) break;
      }
    } catch (error) {
      console.warn('    WARNING: could not list Clerk users for cleanup', (error as Error).message);
    }
    if (removedUsers) console.log(`    removed ${removedUsers} throwaway Clerk user(s) left by earlier runs`);

    // Scenarios created by earlier E2E runs (all titled "E2E …") are removed so counts stay predictable.
    const removed = await db.scenario.deleteMany({ where: { title: { startsWith: 'E2E ' } } });
    // Each run starts with a clean daily budget for the test users.
    await db.llmCall.deleteMany({ where: { user: { email: { in: ['demo@persuaider.com', 'admin@persuaider.dev'] } } } });
    if (removed.count) console.log(`    removed ${removed.count} scenario(s) left by earlier runs`);
    for (const email of ['demo@persuaider.com', 'admin@persuaider.dev']) {
      const list = await clerkClient.users.getUserList({ emailAddress: [email] });
      const clerkUser = list.data?.[0];
      if (clerkUser) {
        await db.user.update({ where: { email }, data: { clerkId: clerkUser.id } });
        console.log(`    linked ${email} -> ${clerkUser.id}`);
      } else {
        console.warn(`    WARNING: no Clerk user found for ${email}; e2e auth for this user will fail`);
      }
    }
  } finally {
    await db.$disconnect();
  }
}
