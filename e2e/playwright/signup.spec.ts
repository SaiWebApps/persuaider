import { test, expect } from '@playwright/test';
import { signUpFresh } from './helpers';

/**
 * Slice 1 acceptance: a brand-new person signs up and lands on the dashboard.
 *
 * Uses Clerk's test-mode email convention (`+clerk_test`) with the fixed
 * verification code 424242, so no mailbox is involved.
 */
test('new user can sign up and land on the dashboard', async ({ page }) => {
  await signUpFresh(page, `slice1+clerk_test-${Date.now()}@example.com`);
  await expect(page.locator('[data-testid="persona-card"], h1, h2').first()).toBeVisible();
});
