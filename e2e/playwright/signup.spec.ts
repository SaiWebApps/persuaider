import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

/**
 * Slice 1 acceptance: a brand-new person signs up and lands on the dashboard.
 *
 * Uses Clerk's test-mode email convention (`+clerk_test`) with the fixed
 * verification code 424242, so no mailbox is involved.
 */
test('new user can sign up and land on the dashboard', async ({ page }) => {
  await setupClerkTestingToken({ page });

  const email = `slice1+clerk_test-${Date.now()}@example.com`;
  await page.goto('/register');

  const emailInput = page.locator('input[name="emailAddress"]');
  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await emailInput.fill(email);
  await page.locator('input[name="password"]').fill(`Pw-${Date.now()}-strong!`);
  await page.locator('button[data-localization-key="formButtonPrimary"], button:has-text("Continue")').first().click();

  const codeInput = page.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  await expect(codeInput).toBeVisible({ timeout: 15000 });
  await codeInput.fill('424242');

  await page.waitForURL('**/dashboard', { timeout: 30000 });
  await expect(page.locator('[data-testid="persona-card"], h1, h2').first()).toBeVisible();
});
