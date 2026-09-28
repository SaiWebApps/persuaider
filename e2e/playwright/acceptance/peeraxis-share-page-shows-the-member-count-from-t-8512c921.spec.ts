import { test, expect } from '@playwright/test';
import { loginAsDemo, loginAsAdmin } from '../helpers';

test.describe.configure({ retries: 0 });

test('a share page shows the member count from the first member', async ({ page, browser }) => {
  test.setTimeout(120000);
  await loginAsDemo(page);

  // Each new scenario starts with its creator as its only member.
  const scenarios: Array<{ title: string; joinCode: string }> = [];
  for (const count of [1, 2]) {
    const title = `E2E Share count ${count} ${Date.now()}`;
    const created = await page.request.post('/api/scenarios', {
      data: {
        title,
        description: 'Negotiate a commercial lease.',
        userRole: 'Tenant',
        aiRole: 'Landlord',
      },
    });
    expect(created.ok()).toBe(true);
    const { scenario } = await created.json();
    scenarios.push({ title, joinCode: scenario.joinCode });
  }

  // Prepare the second scenario with a distinct second member before viewing it.
  const memberContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const memberPage = await memberContext.newPage();
    await loginAsAdmin(memberPage);
    const joined = await memberPage.request.post('/api/scenarios/join', {
      data: { joinCode: scenarios[1].joinCode },
    });
    expect(joined.ok()).toBe(true);
  } finally {
    await memberContext.close();
  }

  await test.step('Open the share link of a scenario that has exactly one member and see "1 person has joined."', async () => {
    await page.goto(`/s/${scenarios[0].joinCode}`);
    await expect(page.getByTestId('share-title')).toHaveText(scenarios[0].title);
    await expect(page.getByTestId('share-page').getByText('1 person has joined.', { exact: true })).toBeVisible();
  });

  await test.step('Open the share link of a scenario that has two members and see "2 people have joined."', async () => {
    await page.goto(`/s/${scenarios[1].joinCode}`);
    await expect(page.getByTestId('share-title')).toHaveText(scenarios[1].title);
    await expect(page.getByTestId('share-page').getByText('2 people have joined.', { exact: true })).toBeVisible();
  });
});
