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

/**
 * Sign up a brand-new user through Clerk's UI using the test-mode email
 * convention (`+clerk_test`) and the fixed code 424242. Waits until Clerk has
 * actually sent the code before typing it; a too-early submit yields "You need
 * to send a verification code before attempting to verify."
 */
export async function signUpFresh(page: Page, email: string): Promise<void> {
  const { setupClerkTestingToken } = await import('@clerk/testing/playwright');
  await setupClerkTestingToken({ page });
  await page.goto('/register');
  const emailInput = page.locator('input[name="emailAddress"]');
  await emailInput.waitFor({ state: 'visible', timeout: 20000 });
  await emailInput.fill(email);
  await page.locator('input[name="password"]').fill(`Pw-${Date.now()}-strong!`);
  await page.locator('button[data-localization-key="formButtonPrimary"], button:has-text("Continue")').first().click();

  const codeInput = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  await codeInput.waitFor({ state: 'visible', timeout: 20000 });
  // The resend link appears once the code has been dispatched.
  await page.locator('button:has-text("Resend")').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

  for (let attempt = 0; attempt < 3; attempt++) {
    await codeInput.fill('424242');
    const landed = await page.waitForURL('**/dashboard', { timeout: 20000 }).then(() => true).catch(() => false);
    if (landed) return;
    const tooEarly = await page.getByText('send a verification code before').isVisible().catch(() => false);
    if (!tooEarly) break;
    await page.locator('button:has-text("Resend")').first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.waitForURL('**/dashboard', { timeout: 20000 });
}
