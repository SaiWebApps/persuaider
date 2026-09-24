import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';

// Peeraxis Outcome A, locked Demonstration. The two top-level step titles are the
// owner-approved steps, verbatim. Run by Peeraxis through scripts/peeraxis/demo.sh.
test.describe.configure({ retries: 0 });

test('an author can save Issue limits that do not overlap, with a warning', async ({ page }) => {
  test.setTimeout(120000);
  await loginAsDemo(page);

  // The learner (Tenant) wants the rent lower: walk-away 1700. The Landlord's walk-away is
  // 1600, so today the deal zone is 1600 – 1700.
  const title = `E2E No-overlap limits ${Date.now()}`;
  const created = await page.request.post('/api/scenarios', {
    data: {
      title,
      description: 'Negotiate a commercial lease.',
      userRole: 'Tenant',
      aiRole: 'Landlord',
      roles: [
        { name: 'Tenant', description: 'Keep the lease affordable.' },
        { name: 'Landlord', description: 'Protect the building value.' },
      ],
      learnerRoleName: 'Tenant',
      issues: [{
        name: 'Monthly rent',
        unit: 'USD',
        learnerWants: 'lower',
        learner: { target: 1500, reservation: 1700, weight: 100 },
        counterpart: { target: 1900, reservation: 1600, weight: 100 },
      }],
      personas: [{
        name: 'Lou the Landlord',
        roleType: 'Landlord',
        roleName: 'Landlord',
        description: 'Firm but fair.',
        initialGreeting: 'Let us discuss the rent.',
      }],
    },
  });
  expect(created.ok()).toBe(true);
  const { scenario } = await created.json();

  const zone = page.getByTestId('issue-0-zone');
  const save = page.getByTestId('edit-save');

  await test.step("In your scenario's editor, set an Issue's limits so they don't overlap. A warning says no deal is possible, and Save stays enabled.", async () => {
    await page.goto(`/scenario/${scenario.id}/edit`);
    await expect(page.getByTestId('issue-0-name')).toHaveValue('Monthly rent');
    await expect(zone).toContainText('Deal zone');
    // The Landlord will not go below 1800; the Tenant will not go above 1700: no overlap.
    await page.getByTestId('issue-0-counterpart-reservation').fill('1800');
    await expect(zone).toContainText(/no deal is possible/i);
    await expect(save).toBeEnabled();
  });

  await test.step('Save and reload. The numbers and the warning are still there.', async () => {
    await save.click();
    await expect(page.getByTestId('edit-saved')).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId('issue-0-name')).toHaveValue('Monthly rent');
    await expect(page.getByTestId('issue-0-learner-target')).toHaveValue('1500');
    await expect(page.getByTestId('issue-0-learner-reservation')).toHaveValue('1700');
    await expect(page.getByTestId('issue-0-counterpart-target')).toHaveValue('1900');
    await expect(page.getByTestId('issue-0-counterpart-reservation')).toHaveValue('1800');
    await expect(zone).toContainText(/no deal is possible/i);
    await expect(save).toBeEnabled();
  });
});
