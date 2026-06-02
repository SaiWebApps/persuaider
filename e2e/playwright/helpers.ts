import { Page } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';

/**
 * Sign in programmatically using Clerk's official testing helper.
 *
 * `clerk.signIn` (email strategy) finds the user by email, mints a sign-in token
 * via the Clerk Backend API, and completes the ticket sign-in client-side. It also
 * applies the Clerk testing token internally to bypass bot protection — which the
 * previous hand-rolled ticket flow did not, causing sign-in to silently stall.
 *
 * Requires `clerkSetup()` to have run in global-setup, and the page to already be
 * on a non-protected page that loads Clerk before calling this helper.
 */
async function signIn(page: Page, emailAddress: string) {
  // Load Clerk on a public page first (required by the helper).
  await page.goto('/login');
  await clerk.signIn({ page, emailAddress });
  // Navigate to the authenticated landing page now that the session exists.
  await page.goto('/dashboard');
  await page.waitForURL('**/dashboard', { timeout: 30000 });
}

export async function loginAsDemo(page: Page) {
  await signIn(page, 'demo@persuaider.com');
}

export async function loginAsAdmin(page: Page) {
  await signIn(page, 'admin@persuaider.dev');
}
