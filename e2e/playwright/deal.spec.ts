import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

/**
 * Slice 5 acceptance: the summary shows the deal against both sides' numbers,
 * and the overall score is the weighted mean of the framework scores.
 *
 * Uses Alex Chen (Salary Negotiation), a fair-minded persona, and closes by
 * accepting a figure inside both walk-away limits so a deal is reachable.
 */
test('summary shows a deal outcome with hidden limits and a computed score', async ({ page }) => {
  test.setTimeout(180000);
  await loginAsDemo(page);

  await page.locator('[data-testid="persona-card"]:has-text("Alex Chen")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });

  const turns = [
    'Thanks for making time. Market data for my role is $118,000 to $125,000, and I led both projects that shipped this quarter. I am asking for $122,000.',
    'I understand the budget is tight. I can accept $117,000 if we put it in writing this week. Do we have a deal at $117,000?',
    'Great, $117,000 it is. I accept. Thank you, Alex.',
  ];
  for (const turn of turns) {
    const before = await page.locator('[data-testid="assistant-message"]').count();
    await page.fill('[data-testid="chat-input"]', turn);
    await page.click('[data-testid="send-button"]');
    await page.waitForFunction(
      (expected) => document.querySelectorAll('[data-testid="assistant-message"]').length >= expected,
      before + 1,
      { timeout: 45000 }
    );
  }

  await page.locator('button:has-text("End Negotiation")').first().click();
  await page.locator('[data-testid="confirm-end-negotiation"]').click();
  await page.waitForURL('**/summary', { timeout: 120000 });

  // Deal block with both sides' numbers
  const deal = page.locator('[data-testid="deal-outcome"]');
  await expect(deal).toBeVisible({ timeout: 15000 });
  await expect(deal).toContainText('Your target');
  await expect(deal).toContainText('$130,000');
  await expect(deal).toContainText('Their hidden limit');
  const status = (await page.locator('[data-testid="deal-status"]').textContent())?.trim();
  expect(['Deal reached', 'No deal']).toContain(status);
  if (status === 'Deal reached') {
    await expect(deal).toContainText('Share of your range captured');
    await expect(page.locator('[data-testid="deal-agreed"]').first()).toContainText('$');
  }
  // First completed attempt with this persona: the counterpart's limit stays hidden.
  await expect(page.locator('[data-testid="hidden-limit"]').first()).toContainText('Revealed after your second attempt');

  // Overall score is present and is the weighted mean of the framework scores (30/40/30).
  const overall = Number(await page.locator('[data-testid="overall-score"]').textContent());
  expect(overall).toBeGreaterThanOrEqual(0);
  expect(overall).toBeLessThanOrEqual(100);
  const rows = page.locator('h3:has-text("Framework Scores") + div > div');
  const byName: Record<string, number> = {};
  for (const row of await rows.all()) {
    const [name, value] = await row.locator('span').allTextContents();
    byName[name.trim()] = Number(value);
  }
  const expected = Math.round((byName['Preparation & Research'] * 30 + byName['Communication & Persuasion'] * 40 + byName['Strategy & Flexibility'] * 30) / 100);
  expect(overall).toBe(expected);
});
