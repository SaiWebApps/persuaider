import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

/**
 * Slice 10 acceptance:
 *  1. Dashboard → Generate with AI → describe a negotiation → Generate. The preview shows the
 *     sides (with "you play"), the numbers per issue (editable), and the personas' sides.
 *  2. Save. The scenario appears on the dashboard with "You play: <side>".
 *  3. Opening one of its personas shows "You play" and the confidential brief.
 */
test('generate a scenario with sides and numbers, save it, play it', async ({ page }) => {
  test.setTimeout(240000);
  await loginAsDemo(page);

  await page.locator('[data-testid="generate-with-ai"]').click();
  await page.locator('textarea, input[type="text"]').first().fill(
    'E2E Buying a used car from a private seller who is relocating next week. I want a fair price and a quick handover.'
  );
  await page.locator('[data-testid="generate-button"]').click();

  const preview = page.locator('[data-testid="scenario-preview"]');
  await expect(preview).toBeVisible({ timeout: 90000 });
  await expect(page.locator('[data-testid="sides-preview"]')).toContainText('you play');
  await expect(page.locator('[data-testid="issues-preview"]')).toBeVisible();
  const learnerTarget = page.locator('[data-testid="issue-0-learner-target"]');
  await expect(learnerTarget).toHaveValue(/\d/);

  // The title must start with "E2E " so the run cleanup removes it.
  const title = page.locator('[data-testid="edit-title"]');
  const generatedTitle = await title.inputValue();
  await title.fill(`E2E ${generatedTitle}`.slice(0, 200));

  await page.locator('[data-testid="save-button"]').click();
  const section = page.locator(`section:has-text("E2E ${generatedTitle.slice(0, 40)}")`).first();
  await expect(section).toBeVisible({ timeout: 20000 });
  await expect(section.locator('[data-testid="you-play"]')).toContainText('You play:');

  await section.locator('[data-testid="persona-card"]').first().click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await expect(page.locator('[data-testid="your-brief"]')).toContainText('You play:');
  await expect(page.locator('[data-testid="your-brief-text"]')).not.toBeEmpty();
});
