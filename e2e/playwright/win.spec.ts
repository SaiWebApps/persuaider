import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsDemo } from './helpers';

/**
 * Slice 8 acceptance:
 *  1. A scenario with a 2-message limit: after two messages the input is disabled and a
 *     banner says to end the negotiation.
 *  2. The summary asks "Did the opponent feel real?"; answering 4 shows thanks.
 *  3. Admin analytics shows the engine gate with at least one learner and one "felt real".
 */
test('message limit is enforced, felt-real is recorded, the gate counts it', async ({ browser }) => {
  test.setTimeout(240000);

  const demoCtx = await browser.newContext();
  const page = await demoCtx.newPage();
  await loginAsDemo(page);

  // A learner-created scenario with a two-message limit, through the API the dashboard uses.
  const title = `E2E Limit ${Date.now()}`;
  const created = await page.request.post('/api/scenarios', {
    data: {
      title,
      description: 'Renew a lease without a rent increase.',
      userRole: 'Tenant',
      aiRole: 'Landlord',
      winCondition: { type: 'manual', maxMessages: 2 },
      personas: [{ name: 'Lou the Landlord', roleType: 'Landlord', description: 'Wants a 10% increase.' }],
    },
  });
  expect(created.ok()).toBe(true);

  await page.goto('/dashboard');
  await page.locator(`section:has-text("${title}") [data-testid="persona-card"]:has-text("Lou")`).click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });

  for (const msg of ['I would like to renew at the current rent.', 'I have been a reliable tenant for three years.']) {
    const before = await page.locator('[data-testid="assistant-message"]').count();
    await page.fill('[data-testid="chat-input"]', msg);
    await page.click('[data-testid="send-button"]');
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="assistant-message"]').length >= n, before + 1, { timeout: 60000 });
  }
  await expect(page.locator('[data-testid="limit-banner"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid="chat-input"]')).toBeDisabled();

  await page.locator('button:has-text("End Negotiation")').first().click();
  await page.locator('[data-testid="confirm-end-negotiation"]').click();
  await page.waitForURL('**/summary', { timeout: 120000 });

  await expect(page.locator('[data-testid="felt-real"]')).toBeVisible();
  await page.locator('[data-testid="felt-real-4"]').click();
  await expect(page.locator('[data-testid="felt-real-thanks"]')).toContainText('4/5');
  await demoCtx.close();

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginAsAdmin(adminPage);
  await adminPage.goto('/admin/analytics');
  const gate = adminPage.locator('[data-testid="engine-gate"]');
  await expect(gate).toBeVisible({ timeout: 20000 });
  const completed = Number(((await adminPage.locator('[data-testid="gate-completed"]').textContent()) ?? '0').split('/')[0]);
  const feltReal = Number(((await adminPage.locator('[data-testid="gate-felt-real"]').textContent()) ?? '0').split('/')[0]);
  expect(completed).toBeGreaterThanOrEqual(1);
  expect(feltReal).toBeGreaterThanOrEqual(1);
  await adminCtx.close();
});
