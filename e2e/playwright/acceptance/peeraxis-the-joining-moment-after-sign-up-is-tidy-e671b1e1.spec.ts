import { test, expect } from '@playwright/test';
import { loginAsDemo, signUpFresh } from '../helpers';

test.describe.configure({ retries: 0 });

test('the joining moment after sign-up is tidy', async ({ page, browser }) => {
  test.setTimeout(120000);

  // A private fixture keeps the displayed member count independent of other runs.
  // The visitor's page remains signed out while the author prepares the scenario.
  const title = 'Joining moment: a commercial lease';
  let joinCode: string;
  const fixtureContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const authorPage = await fixtureContext.newPage();
    await loginAsDemo(authorPage);
    const created = await authorPage.request.post('/api/scenarios', {
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
    joinCode = (await created.json()).scenario.joinCode;
  } finally {
    await fixtureContext.close();
  }

  const share = page.getByTestId('share-page');
  const joining = share.getByTestId('share-joining');
  const notice = 'You joined the scenario. Pick a counterpart below to start.';
  let signupFinished: Promise<{ error?: unknown }>;

  await test.step('Finish sign-up from a share link: see "Joining…" as plain text on the scenario page, with the scenario title still shown and no buttons or links to tap', async () => {
    await page.goto(`/s/${joinCode}`);
    const signup = share.getByRole('link', { name: 'Sign up and practise', exact: true });
    await expect(signup).toBeVisible();
    const registerPath = await signup.getAttribute('href');
    if (!registerPath) throw new Error('The sign-up link needs a destination.');

    // Observe the real return while the established helper completes sign-up.
    // Do not wait for a particular return address, intercept joining requests,
    // or pause navigation: the intermediate label must be visible on its own.
    signupFinished = signUpFresh(page, `tidy-joining+clerk_test-${Date.now()}@example.com`, {
      registerPath,
      landing: '**/dashboard**',
    }).then(() => ({}), (error: unknown) => ({ error }));

    await expect(joining).toBeVisible({ timeout: 90000 });
    // Check together so observing this transient state does not add a sequence
    // of waits before taking its screenshot.
    await Promise.all([
      expect(joining).toHaveCount(1),
      expect(joining).toHaveText('Joining…'),
      expect(share.getByText('Joining…', { exact: true })).toHaveCount(1),
      expect(share.getByTestId('share-title')).toHaveText(title),
      expect(share.getByTestId('share-title').and(share.getByRole('heading', { name: title, exact: true }))).toBeVisible(),
      expect(page).toHaveTitle(`${title} · Persuaider`),
      ...[
        'A Persuaider scenario from Demo User',
        'Negotiate a commercial lease.',
        'You play',
        'Tenant',
        'Against',
        'Landlord',
        'Counterparts to choose from: Lou the Landlord',
        '1 person has joined.',
        'You will chat with an AI playing the other side. It holds a hidden walk-away it will not cross. When you stop, you see what you got, what you left on the table, and what to change. About ten minutes.',
        "Your side's confidential brief and the hidden numbers appear only once you have joined.",
      ].map((text) => expect(share.getByText(text, { exact: true })).toBeVisible()),
      expect(share.getByRole('button')).toHaveCount(0),
      expect(share.getByRole('link')).toHaveCount(0),
      ...[
        'Sign up and practise',
        'I have an account',
        'Practise this scenario',
        'You already have this scenario. Open dashboard',
      ].map((text) => expect(share.getByText(text, { exact: true })).not.toBeVisible()),
    ]);
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step('Then the dashboard appears showing "You joined the scenario. Pick a counterpart below to start."', async () => {
    // No click after verification: joining brings the visitor here automatically.
    await expect(page.getByTestId('dashboard-notice')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('dashboard-notice')).toHaveText(notice);
    await expect(page).toHaveTitle('Persuaider');
    await expect(page.getByRole('heading', { name: 'Your Training Dashboard', exact: true })).toBeVisible();
    const signupResult = await signupFinished;
    if (signupResult.error) throw signupResult.error;
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });
});
