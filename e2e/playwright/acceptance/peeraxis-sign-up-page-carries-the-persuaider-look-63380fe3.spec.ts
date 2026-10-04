import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

test('the sign-up page carries the Persuaider look and fits a phone', async ({ page, browser, baseURL }) => {
  test.setTimeout(120000);

  const title = 'E2E Share a commercial lease';
  let joinCode: string;
  const creatorContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const creatorPage = await creatorContext.newPage();
    await loginAsDemo(creatorPage);
    const created = await creatorPage.request.post('/api/scenarios', {
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
    const { scenario } = await created.json();
    expect(typeof scenario.joinCode).toBe('string');
    expect(scenario.joinCode.length).toBeGreaterThan(0);
    joinCode = scenario.joinCode;
  } finally {
    await creatorContext.close();
  }

  await setupClerkTestingToken({ page });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 860 });

  const signupPage = page.getByTestId('signup-page');
  const brand = signupPage.getByTestId('signup-brand');
  const scenarioTitle = signupPage.getByTestId('signup-scenario-title');
  const box = signupPage.getByTestId('signup-box');
  const email = box.getByRole('textbox', { name: 'Email address', exact: true });
  const continueButton = box.getByRole('button', { name: 'Continue', exact: true });
  const sharePath = `/s/${joinCode}`;
  let signupUrl: string;

  async function checkSignup(withScenario: boolean) {
    // Clerk can load after the server-rendered branding; the email field marks readiness.
    await expect(email).toBeVisible({ timeout: 30000 });
    await expect(signupPage).toBeVisible();
    await expect(box).toBeVisible();
    await expect(brand).toBeVisible();
    await expect(brand).toHaveText('Persuaider');
    await expect(brand.and(page.getByRole('link'))).toHaveCount(0);
    await expect(brand.getByRole('link')).toHaveCount(0);
    if (withScenario) {
      await expect(scenarioTitle).toBeVisible();
      await expect(scenarioTitle).toHaveText(title);
      await expect(scenarioTitle.and(page.getByRole('heading', { name: title, exact: true }))).toBeVisible();
    } else {
      await expect(scenarioTitle).not.toBeVisible();
    }
    await expect(continueButton).toBeVisible();
    await expect(page).toHaveTitle('Sign up · Persuaider');
  }

  await test.step('From a share link, tap "Sign up and practise": see "Persuaider" and the scenario title above the sign-up box, with the box\'s fields and "Continue" button in the chosen colours and typeface, and the browser tab reads "Sign up · Persuaider"', async () => {
    await page.goto(sharePath);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Sign up and practise', exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === '/register'
      && url.searchParams.get('redirect_url') === `${sharePath}?join=1`);
    signupUrl = page.url();
    await checkSignup(true);

    // A direct visit and an inactive return link must not invent a scenario title.
    await page.goto('/register');
    await checkSignup(false);
    await page.goto(`/register?redirect_url=${encodeURIComponent('/s/E2E-NEVER-EXISTED?join=1')}`);
    await checkSignup(false);
    await page.goto(signupUrl);
    await checkSignup(true);
    // Colours, typeface, radius and placement are reviewed from the screenshots.
    await page.screenshot({ path: test.info().outputPath('step-1.png'), fullPage: true });
  });

  await test.step('Switch the device to dark mode: the same page looks deliberate in dark colours, not inverted or half-styled', async () => {
    // Change the device preference on the loaded page, without navigating or reloading.
    await page.emulateMedia({ colorScheme: 'dark' });
    await checkSignup(true);
    await expect(page).toHaveURL(signupUrl);
    await page.screenshot({ path: test.info().outputPath('step-2.png'), fullPage: true });
  });

  await test.step('Open the same page on a phone: the box fits the screen width with no sideways scrolling and the email field is easy to tap', async () => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.goto(signupUrl);
    await checkSignup(true);
    // Measure only the promised overflow, without prescribing the layout or styling.
    async function checkPhoneWidth() {
      await expect.poll(() => page.evaluate(() => Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ))).toBeLessThanOrEqual(375);
      await expect.poll(() => box.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(375);
    }
    await checkPhoneWidth();
    await email.click();
    await expect(email).toBeFocused();
    await expect(email).toBeEditable();
    await checkPhoneWidth();
    await page.screenshot({ path: test.info().outputPath('step-3.png'), fullPage: true });
  });
});
