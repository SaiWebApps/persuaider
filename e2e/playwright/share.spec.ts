import { test, expect } from '@playwright/test';
import { signUpFresh, loginAsDemo } from './helpers';

/**
 * Slice 12 acceptance: a stranger gets a scenario link, sees what it is without
 * any confidential brief, signs up, and lands on the dashboard already joined.
 * The landing page is public; signed-in visitors skip it.
 */
test.describe('shareable scenario link', () => {
  test('the landing page is public and offers sign-up', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-testid="landing-signup"]')).toBeVisible();
    await page.locator('[data-testid="landing-signup"]').click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('a share page shows title and sides without briefs or numbers, and hides unknown codes', async ({ page }) => {
    await page.goto('/s/EXAMPLE1');
    await expect(page.locator('[data-testid="share-title"]')).toHaveText('Salary Negotiation');
    await expect(page.locator('[data-testid="share-you-play"]')).toHaveText('Employee');
    const text = await page.locator('[data-testid="share-page"]').innerText();
    expect(text).not.toMatch(/130,?000|115,?000|120,?000|108,?000/);
    expect(text).not.toMatch(/walk-away is|your target is/i);
    await expect(page.locator('[data-testid="share-signup"]')).toBeVisible();

    await page.goto('/s/NOPE9999');
    await expect(page.locator('[data-testid="share-missing"]')).toBeVisible();
  });

  test('a stranger signs up from the link and lands joined, then joins a second scenario with one click', async ({ page }) => {
    await page.goto('/s/EXAMPLE1');
    await expect(page.locator('[data-testid="share-what"]')).toContainText('hidden walk-away');
    const href = await page.locator('[data-testid="share-signup"]').getAttribute('href');
    expect(href).toMatch(/^\/register\?redirect_url=/);
    await signUpFresh(page, `share+clerk_test-${Date.now()}@example.com`, { registerPath: href!, landing: '**/dashboard**' });
    await expect(page.getByText('You joined the scenario')).toBeVisible({ timeout: 20000 });
    // Membership, not just the notice: the joined scenario's card with its side badge and Share.
    await expect(page.locator('[data-testid="you-play"]')).toHaveCount(1);
    await expect(page.locator('[data-testid^="share-scenario-"]')).toHaveCount(1);
    await expect(page.getByText('Salary Negotiation').first()).toBeVisible();

    await page.goto('/s/AIADOPT1');
    await page.locator('[data-testid="share-join"]').click();
    await page.waitForURL('**/dashboard**');
    await expect(page.getByText('You joined the scenario')).toBeVisible();
    await expect(page.locator('[data-testid^="share-scenario-"]')).toHaveCount(2);

    await page.goto('/s/AIADOPT1');
    await expect(page.locator('[data-testid="share-open-dashboard"]')).toBeVisible();
  });

  test('a member copies the share link from the dashboard', async ({ page }) => {
    await loginAsDemo(page);
    const share = page.locator('[data-testid^="share-scenario-"]').first();
    await expect(share).toBeVisible();
    await share.click();
    await expect(page.locator('[data-testid$="-status"]').first()).toContainText(/\/s\/[A-Z0-9]+/);
  });
});
