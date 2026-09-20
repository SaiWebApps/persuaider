import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

/**
 * Slice 3 acceptance: a scenario created by a learner from the dashboard is
 * scored like any other. Before this slice, learner-created scenarios stored
 * empty evaluation criteria and the summary had no framework scores.
 */
test('a learner-created scenario gets framework scores on the summary', async ({ page }) => {
  test.setTimeout(150000);
  await loginAsDemo(page);

  const title = `E2E Vendor Renewal ${Date.now()}`;
  await page.locator('button:has-text("Create Scenario")').first().click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator('input[name="title"]').fill(title);
  await dialog.locator('textarea[name="description"]').fill('Renew a software contract without a price increase.');
  await dialog.locator('input[name="userRole"]').fill('Procurement lead');
  await dialog.locator('input[name="aiRole"]').fill('Account manager');
  await dialog.locator('input[placeholder="Name"]').first().fill('Riley the Account Manager');
  await dialog.locator('input[placeholder="Role type"]').first().fill('Vendor');
  await dialog.locator('button:has-text("Create Scenario")').click();

  const section = page.locator(`section:has-text("${title}")`);
  await expect(section).toBeVisible({ timeout: 15000 });
  await section.locator('[data-testid="persona-card"]:has-text("Riley")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });

  for (const msg of [
    'We have been a customer for three years and our usage has not grown; we need the renewal at the same price.',
    'If the price rises we will move to a competitor who quoted us 20% less last month.',
  ]) {
    await page.fill('[data-testid="chat-input"]', msg);
    await page.click('[data-testid="send-button"]');
    const count = await page.locator('[data-testid="assistant-message"]').count();
    await page.waitForFunction(
      (expected) => document.querySelectorAll('[data-testid="assistant-message"]').length >= expected,
      count + 1,
      { timeout: 30000 }
    );
  }

  await page.locator('button:has-text("End Negotiation")').first().click();
  await page.locator('[data-testid="confirm-end-negotiation"]').click();
  await page.waitForURL('**/summary', { timeout: 90000 });

  await expect(page.locator('[data-testid="overall-score"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('h3:has-text("Framework Scores"), h2:has-text("Framework Scores")').first()).toBeVisible();
  await expect(page.getByText('Preparation').first()).toBeVisible();
  await expect(page.getByText('Deal-making').first()).toBeVisible();

  // Older summaries still render: open one from History.
  await page.goto('/history');
  const first = page.locator('a[href*="/summary"]').first();
  await expect(first).toBeVisible({ timeout: 15000 });
  await first.click();
  await page.waitForURL('**/summary', { timeout: 15000 });
  await expect(page.locator('[data-testid="overall-score"], [data-testid="not-scored"]').first()).toBeVisible();
});
