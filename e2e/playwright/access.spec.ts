import { test, expect } from '@playwright/test';
import { loginAsDemo, signUpFresh } from './helpers';

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
  // Reopening from the dashboard resumes the same conversation, not a new one.
  await memberPage.goto('/dashboard');
  await memberPage.locator('[data-testid="persona-card"]:has-text("Alex Chen")').click();
  await memberPage.waitForURL('**/persona/*/chat', { timeout: 15000 });
  expect(memberPage.url()).toBe(chatUrl);
  await memberContext.close();

  // Stranger signs up fresh and pastes the URL.
  const strangerContext = await browser.newContext();
  const strangerPage = await strangerContext.newPage();
  await signUpFresh(strangerPage, `stranger+clerk_test-${Date.now()}@example.com`);

  await strangerPage.goto(chatUrl);
  await strangerPage.waitForURL('**/dashboard?notice=join-required', { timeout: 15000 });
  await expect(strangerPage.locator('[data-testid="dashboard-notice"]')).toContainText('Join a scenario');
  await expect(strangerPage.locator('[data-testid="chat-input"]')).toHaveCount(0);
  await strangerContext.close();
});
