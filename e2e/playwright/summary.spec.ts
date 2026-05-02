import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

test('completing a conversation shows real evaluation scores', async ({ page }) => {
  test.setTimeout(120000);

  await loginAsDemo(page);

  // Use Jordan Wallace specifically — not consumed by other tests
  await page.locator('[data-testid="persona-card"]:has-text("Jordan Wallace")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });

  // Exchange 3 messages
  const messages = [
    'I believe I deserve a raise based on my performance this year.',
    'My team delivered 3 major projects ahead of schedule under my leadership.',
    'According to Glassdoor data, my current salary is 15% below the market median for my role.',
  ];

  for (const msg of messages) {
    await page.fill('[data-testid="chat-input"]', msg);
    await page.click('[data-testid="send-button"]');
    const currentCount = await page.locator('[data-testid="assistant-message"]').count();
    await page.waitForFunction(
      (expected) => document.querySelectorAll('[data-testid="assistant-message"]').length >= expected,
      currentCount + 1,
      { timeout: 30000 }
    );
  }

  // Click the header "End Negotiation" button
  await page.locator('button:has-text("End Negotiation")').first().click();

  // Click confirm in the modal
  const confirmBtn = page.locator('[data-testid="confirm-end-negotiation"]');
  await expect(confirmBtn).toBeVisible({ timeout: 5000 });
  await confirmBtn.click();

  // Wait for redirect to summary page
  await page.waitForURL('**/summary', { timeout: 90000 });

  // Verify summary page has real evaluation data
  const scoreElement = page.locator('[data-testid="overall-score"]');
  await expect(scoreElement).toBeVisible({ timeout: 15000 });
  const scoreText = await scoreElement.textContent();
  const score = parseInt(scoreText!);
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);

  await expect(page.locator('h3:has-text("What Went Well")').first()).toBeVisible();
  await expect(page.locator('h3:has-text("What To Improve")').first()).toBeVisible();
});
