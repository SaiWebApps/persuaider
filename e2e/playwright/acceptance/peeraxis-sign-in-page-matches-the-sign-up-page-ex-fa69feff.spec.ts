import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { loginAsAdmin } from '../helpers';

test.describe.configure({ retries: 0 });

test('sign-in carries the sign-up branding on desktop, phone and shared scenarios', async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);

  const title = 'E2E Share a commercial lease';
  const inactiveTitle = 'E2E Archived commercial lease';
  const creatorContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  let sharePath: string;
  let inactiveSharePath: string;
  try {
    const creatorPage = await creatorContext.newPage();
    await loginAsAdmin(creatorPage);
    async function createScenario(scenarioTitle: string) {
      const created = await creatorPage.request.post('/api/scenarios', {
        data: {
          title: scenarioTitle,
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
      const { scenario } = await created.json();
      expect(typeof scenario.joinCode).toBe('string');
      expect(scenario.joinCode.length).toBeGreaterThan(0);
      return scenario;
    }
    const active = await createScenario(title);
    const inactive = await createScenario(inactiveTitle);
    const archived = await creatorPage.request.patch(`/api/admin/scenarios/${inactive.id}`, {
      data: { status: 'archived' },
    });
    expect(archived.ok()).toBe(true);
    sharePath = `/s/${active.joinCode}`;
    inactiveSharePath = `/s/${inactive.joinCode}`;
  } finally {
    await creatorContext.close();
  }

  await setupClerkTestingToken({ page });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 860 });

  const signinPage = page.getByTestId('signin-page');
  const brand = signinPage.getByTestId('signin-brand');
  const box = signinPage.getByTestId('signin-box');
  // The card explicitly identifies Clerk's first textbox as the readiness signal.
  const firstField = box.getByRole('textbox').first();
  const continueButton = box.getByRole('button', { name: 'Continue', exact: true });
  const scenarioTitle = signinPage.getByTestId('signin-scenario-title');

  async function checkSignin() {
    await expect(firstField).toBeVisible({ timeout: 30000 });
    await expect(signinPage).toBeVisible();
    await expect(box).toBeVisible();
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText('Persuaider');
    await expect(brand.and(page.getByRole('link'))).toHaveCount(0);
    await expect(brand.getByRole('link')).toHaveCount(0);
    await expect(continueButton).toBeVisible();
    await expect(page).toHaveTitle('Sign in · Persuaider');
  }

  await test.step('From the home page, tap "Sign in": see "Persuaider" above the sign-in box, the browser tab reads "Sign in · Persuaider", and the box\'s field and "Continue" button look exactly like the sign-up box\'s', async () => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === '/login');
    await checkSignin();
    await expect(scenarioTitle).not.toBeVisible();
    // Visual review compares branding, placement, colours, typeface and corner
    // radius with the completed sign-up card; no styling implementation is prescribed.
    await page.screenshot({ path: test.info().outputPath('step-1.png'), fullPage: true });
  });

  await test.step('Switch to dark mode and open it on a phone: still matches the sign-up page, fits the width, no sideways scrolling', async () => {
    // Change the device preference on the already-open page, without a reload.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 375, height: 844 });
    await checkSignin();
    await expect(scenarioTitle).not.toBeVisible();
    // Measure the promised overflow only, without choosing elements by geometry.
    await expect.poll(() => page.evaluate(() => Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ) <= window.innerWidth)).toBe(true);
    await expect.poll(() => box.evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('step-2.png'), fullPage: true });
  });

  await test.step('From a share link, tap "I have an account": the same sign-in page now also shows the scenario title above the box', async () => {
    await page.goto('/login');
    await checkSignin();
    await expect(scenarioTitle).not.toBeVisible();

    await page.goto(`/login?redirect_url=${encodeURIComponent(`${inactiveSharePath}?join=1`)}`);
    await checkSignin();
    await expect(scenarioTitle).not.toBeVisible();
    await expect(signinPage.getByRole('heading', { name: inactiveTitle, exact: true })).not.toBeVisible();

    await page.goto(sharePath);
    await page.getByRole('link', { name: 'I have an account', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === '/login');
    await checkSignin();
    await expect(scenarioTitle).toBeVisible();
    await expect(scenarioTitle).toHaveText(title);
    await expect(scenarioTitle.and(signinPage.getByRole('heading', { name: title, exact: true }))).toBeVisible();
    // Count only the scenario's heading: Clerk may also render its own form heading.
    await expect(signinPage.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath('step-3.png'), fullPage: true });
  });
});
