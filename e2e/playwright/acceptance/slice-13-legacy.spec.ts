import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';
test.describe.configure({ retries: 0 });

test('an existing scenario without saved sides can add and retain an Issue', async ({ page }) => {
  test.setTimeout(120000);
  await loginAsDemo(page);
  const title = `E2E Legacy Issues ${Date.now()}`;
  const created = await page.request.post('/api/scenarios', { data: {
    title, description: 'Employee negotiates salary with the boss.',
    userRole: 'Employee', aiRole: 'Evil Boss',
    personas: [
      { name: 'Oliver', roleType: 'Employee', description: 'Wants a raise.' },
      { name: 'Boss', roleType: 'Boss', description: 'Controls pay.' },
    ],
  } });
  expect(created.ok()).toBe(true);
  const { scenario } = await created.json();
  await test.info().attach('demo-scenario', { body: JSON.stringify({ id: scenario.id, title }), contentType: 'application/json' });
  await page.goto(`/scenario/${scenario.id}/edit`);
  await test.step('Open an older scenario; Add Issue works without hidden setup.', async () => {
    await expect(page.getByTestId('add-issue')).toBeEnabled();
    await page.getByTestId('add-issue').click();
    await page.getByTestId('issue-0-name').fill('Salary');
    await page.getByTestId('issue-0-unit').fill('USD');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('edit-saved')).toBeVisible();
  });
  await test.step('Reload, edit the Issue again, save and reload; both saves persist.', async () => {
    await page.reload();
    await expect(page.getByTestId('issue-0-name')).toHaveValue('Salary');
    await expect(page.getByTestId('persona-0-name')).toHaveValue('Oliver');
    await expect(page.getByTestId('persona-1-name')).toHaveValue('Boss');
    await page.getByTestId('issue-0-name').fill('Annual salary');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('edit-saved')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('issue-0-name')).toHaveValue('Annual salary');
    await expect(page.getByTestId('side-0-name')).toHaveValue('Employee');
    await expect(page.getByTestId('side-1-name')).toHaveValue('Evil Boss');
  });
});
