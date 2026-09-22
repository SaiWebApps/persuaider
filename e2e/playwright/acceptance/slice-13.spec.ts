import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

test('the creator changes Issues and an AI Persona in the scenario editor', async ({ page }) => {
  test.setTimeout(120000);
  await loginAsDemo(page);

  const title = `E2E Editable Issues and Persona ${Date.now()}`;
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
        counterpart: { target: 1800, reservation: 1600, weight: 100 },
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
  await test.info().attach('demo-scenario', {
    body: JSON.stringify({ id: scenario.id, title, url: new URL(`/scenario/${scenario.id}/edit`, page.url()).href }),
    contentType: 'application/json',
  });

  await test.step('Open your scenario editor; the current Issue and AI Persona are editable.', async () => {
    await page.goto(`/scenario/${scenario.id}/edit`);
    await expect(page.locator('[data-testid="issue-0-name"]')).toHaveValue('Monthly rent');
    await expect(page.locator('[data-testid="persona-0-name"]')).toHaveValue('Lou the Landlord');
  });

  await test.step('Add Delivery date, remove Monthly rent, edit the AI Persona, and Save; “Saved.” appears.', async () => {
    await page.locator('[data-testid="add-issue"]').click();
    await page.locator('[data-testid="issue-1-name"]').fill('Delivery date');
    await page.locator('[data-testid="issue-1-unit"]').fill('days');
    await page.locator('[data-testid="remove-issue-0"]').click();
    await page.locator('[data-testid="persona-0-name"]').fill('Morgan the Owner');
    await page.locator('[data-testid="persona-0-description"]').fill('Patient, exacting, and protective of the property.');
    await page.locator('[data-testid="persona-0-greeting"]').fill('Show me why these terms work for both of us.');
    await page.locator('[data-testid="edit-save"]').click();
    await expect(page.locator('[data-testid="edit-saved"]')).toBeVisible({ timeout: 15000 });
  });

  await test.step('Reload the editor; Delivery date remains, Monthly rent is gone, and the edited Persona remains.', async () => {
    await page.reload();
    await expect(page.locator('[data-testid="issue-0-name"]')).toHaveValue('Delivery date');
    await expect(page.locator('input[data-testid^="issue-"][data-testid$="-name"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="persona-0-name"]')).toHaveValue('Morgan the Owner');
    await expect(page.locator('[data-testid="persona-0-description"]')).toHaveValue(/exacting/);
    await expect(page.locator('[data-testid="persona-0-greeting"]')).toHaveValue(/both of us/);
  });

  await test.step('Invalid numbers prevent saving; correcting them restores Save.', async () => {
    await page.getByTestId('issue-0-learner-target').fill('200');
    await expect(page.getByTestId('edit-save')).toBeDisabled();
    await page.getByTestId('issue-0-learner-target').fill('0');
    await expect(page.getByTestId('edit-save')).toBeEnabled();
  });

  await test.step('An empty Persona name shows an error, not Saved; correcting it succeeds.', async () => {
    await page.getByTestId('persona-0-name').fill('');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('edit-error')).toBeVisible();
    await expect(page.getByTestId('edit-saved')).toHaveCount(0);
    await page.getByTestId('persona-0-name').fill('Morgan the Owner');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('edit-saved')).toBeVisible();
  });

  await page.getByTestId('edit-numbers').scrollIntoViewIfNeeded();
  await test.info().attach('issues-desktop', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByTestId('persona-0-name').scrollIntoViewIfNeeded();
  await test.info().attach('persona-desktop', { body: await page.screenshot(), contentType: 'image/png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('edit-numbers').scrollIntoViewIfNeeded();
  await test.info().attach('issues-mobile', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByTestId('persona-0-name').scrollIntoViewIfNeeded();
  await test.info().attach('persona-mobile', { body: await page.screenshot(), contentType: 'image/png' });
});
