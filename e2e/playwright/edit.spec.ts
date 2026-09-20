import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

/**
 * Slice 11 acceptance:
 *  1. On a scenario you created, the dashboard shows Edit; it opens the editor with your
 *     sides, briefs and numbers.
 *  2. Change your brief and your walk-away, make it public, Save: "Saved." appears.
 *  3. Reopen the editor: the new values are there; the chat shows the new brief.
 */
test('the creator edits briefs, numbers and visibility', async ({ page }) => {
  test.setTimeout(120000);
  await loginAsDemo(page);

  const title = `E2E Editable ${Date.now()}`;
  const created = await page.request.post('/api/scenarios', {
    data: {
      title, description: 'Renew a lease.', userRole: 'Tenant', aiRole: 'Landlord',
      roles: [{ name: 'Tenant', description: 'You have been a good tenant.' }, { name: 'Landlord', description: 'You want more rent.' }],
      learnerRoleName: 'Tenant',
      issues: [{ name: 'Monthly rent', unit: 'USD', learnerWants: 'lower', learner: { target: 1500, reservation: 1700, weight: 100 }, counterpart: { target: 1800, reservation: 1600, weight: 100 } }],
      personas: [{ name: 'Lou the Landlord', roleType: 'Landlord', roleName: 'Landlord', description: 'Firm but fair.' }],
    },
  });
  expect(created.ok()).toBe(true);
  const { scenario } = await created.json();

  await page.goto('/dashboard');
  await page.locator(`[data-testid="edit-scenario-${scenario.id}"]`).click();
  await page.waitForURL('**/edit', { timeout: 15000 });
  await expect(page.locator('[data-testid="edit-scenario"]')).toBeVisible();
  await expect(page.locator('[data-testid="side-0-brief"]')).toHaveValue('You have been a good tenant.');
  await expect(page.locator('[data-testid="issue-0-learner-reservation"]')).toHaveValue('1700');

  await page.locator('[data-testid="side-0-brief"]').fill('You have been a good tenant for five years and pay on time.');
  await page.locator('[data-testid="issue-0-learner-reservation"]').fill('1650');
  await expect(page.locator('[data-testid="issue-0-zone"]')).toContainText('Deal zone: 1,600 – 1,650');
  await page.locator('[data-testid="visibility-public"]').check();
  await page.locator('[data-testid="edit-save"]').click();
  await expect(page.locator('[data-testid="edit-saved"]')).toBeVisible({ timeout: 15000 });

  await page.reload();
  await expect(page.locator('[data-testid="side-0-brief"]')).toHaveValue(/five years/);
  await expect(page.locator('[data-testid="issue-0-learner-reservation"]')).toHaveValue('1650');
  await expect(page.locator('[data-testid="visibility-public"]')).toBeChecked();

  await page.goto('/dashboard');
  await page.locator('section').filter({ hasText: title }).locator('[data-testid="persona-card"]').first().click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await expect(page.locator('[data-testid="your-brief-text"]')).toContainText('five years');
});
