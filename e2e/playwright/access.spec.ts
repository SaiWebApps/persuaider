import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { loginAsDemo } from './helpers';

/**
 * Slice 2 acceptance: only members can practice in a scenario.
 *
 * 1. A member (demo) opens a persona chat: it works.
 * 2. A brand-new user who joined nothing pastes that same chat URL: they are
 *    sent to the dashboard with a "join this scenario first" notice.
 */
test('a learner who never joined the scenario cannot open its persona chat', async ({ browser }) => {
  // Member opens the chat and we capture the URL.
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await loginAsDemo(memberPage);
  await memberPage.locator('[data-testid="persona-card"]:has-text("Alex Chen")').click();
  await memberPage.waitForURL('**/persona/*/chat', { timeout: 15000 });
  await expect(memberPage.locator('[data-testid="assistant-message"]').first()).toBeVisible({ timeout: 15000 });
  const chatUrl = memberPage.url();
  await memberContext.close();

  // Stranger signs up fresh and pastes the URL.
  const strangerContext = await browser.newContext();
  const strangerPage = await strangerContext.newPage();
  await setupClerkTestingToken({ page: strangerPage });
  await strangerPage.goto('/register');
  await strangerPage.locator('input[name="emailAddress"]').fill(`stranger+clerk_test-${Date.now()}@example.com`);
  await strangerPage.locator('input[name="password"]').fill(`Pw-${Date.now()}-strong!`);
  await strangerPage.locator('button[data-localization-key="formButtonPrimary"], button:has-text("Continue")').first().click();
  const codeInput = strangerPage.locator('input[name="code"], input[autocomplete="one-time-code"]').first();
  await expect(codeInput).toBeVisible({ timeout: 15000 });
  await codeInput.fill('424242');
  await strangerPage.waitForURL('**/dashboard', { timeout: 30000 });

  await strangerPage.goto(chatUrl);
  await strangerPage.waitForURL('**/dashboard?notice=join-required', { timeout: 15000 });
  await expect(strangerPage.locator('[data-testid="dashboard-notice"]')).toContainText('Join a scenario');
  await expect(strangerPage.locator('[data-testid="chat-input"]')).toHaveCount(0);
  await strangerContext.close();
});
