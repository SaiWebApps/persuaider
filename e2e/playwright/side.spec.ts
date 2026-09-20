import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

/**
 * Slice 9 acceptance (Salary Negotiation has two sides: Employee and Manager):
 *  1. The dashboard says "You play: Employee" and groups the personas under "Against: Manager".
 *  2. Opening Pat Morales shows "You play: Employee" with the confidential Employee brief.
 *  3. The persona is told the trainee's side but not their brief (checked by asking).
 */
test('the learner plays a side and sees their confidential brief', async ({ page }) => {
  test.setTimeout(120000);
  await loginAsDemo(page);

  const salary = page.locator('section:has-text("Salary Negotiation")');
  await expect(salary.locator('[data-testid="you-play"]')).toContainText('You play: Employee');
  await expect(salary.locator('[data-testid="against-side"]').first()).toContainText('Against: Manager');

  await salary.locator('[data-testid="persona-card"]:has-text("Pat Morales")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await expect(page.locator('[data-testid="your-brief"]')).toContainText('You play: Employee');
  await expect(page.locator('[data-testid="your-brief-text"]')).toContainText('competing verbal offer at $115,000');
});
