import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

test('landing and share pages give a signed-out visitor a clear next step', async ({ page, browser, baseURL }) => {
  test.setTimeout(120000);

  const title = 'E2E Share a commercial lease';
  const description = 'Negotiate a commercial lease.';
  let joinCode: string;
  // Keep the tour signed out; only the isolated creator session joins the scenario.
  const creatorContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const creatorPage = await creatorContext.newPage();
    await loginAsDemo(creatorPage);
    const created = await creatorPage.request.post('/api/scenarios', {
      data: {
        title,
        description,
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

  // The owner's explicit 375px decision overrides the generic 390px tour rule.
  // Resize this same page; all appearance and stacking judgments are visual.
  const viewports = [
    { name: 'laptop', width: 1280, height: 860 },
    { name: 'phone', width: 375, height: 844 },
  ] as const;
  const headline = 'Rehearse the negotiation before it happens.';
  const benefits = [
    'An opponent that holds its line instead of folding.',
    'A scorecard with real numbers: your target, your walk-away, their limit, your share of the range.',
    'Your scenarios stay private unless you share the link.',
  ];

  async function checkHome() {
    await expect(page).toHaveTitle('Persuaider');
    await expect(page.getByRole('heading', { name: headline, exact: true })).toBeVisible();
    for (const sentence of benefits) {
      // Today's copy has a typed bullet; the restyle removes only that prefix.
      await expect(page.getByText(sentence, { exact: true }).or(
        page.getByText(`· ${sentence}`, { exact: true }),
      )).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Try it free', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  }

  async function followLink(name: string, pathname: string, source: string, redirect?: string) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(url => url.pathname === pathname
      && (redirect === undefined || url.searchParams.get('redirect_url') === redirect));
    // Authentication forms are outside this tour; verify arrival, then return.
    await page.goto(source);
  }

  async function homeAtBothSizes(step: number) {
    await page.setViewportSize(viewports[0]);
    await page.goto('/');
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await checkHome();
      await page.screenshot({ path: test.info().outputPath(`step-${step}-${viewport.name}.png`), fullPage: true });
      await followLink('Try it free', '/register', '/');
      await followLink('Sign in', '/login', '/');
      await checkHome();
    }
  }

  await test.step('Open the home page on a laptop: see "Rehearse the negotiation before it happens." in the new typeface, the three benefit lines laid out as a clear list, "Try it free" as the one standout button and "Sign in" beside it', async () => {
    await homeAtBothSizes(1);
  });

  await test.step('Narrow the window to phone width or open it on a phone: nothing is cut off, the text stays readable, and the two buttons stack and are easy to tap', async () => {
    await homeAtBothSizes(2);
  });

  await test.step('Open a share link: see the scenario title, "You play" and "Against" as two tidy panels, "1 person has joined." (or the matching count) and "Sign up and practise" as the standout button; on a phone the two panels stack', async () => {
    const sharePath = `/s/${joinCode}`;
    await page.setViewportSize(viewports[0]);
    await page.goto(sharePath);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      for (const text of [
        description,
        'You play',
        'Tenant',
        'Against',
        'Landlord',
        'Counterparts to choose from: Lou the Landlord',
        '1 person has joined.',
        "Your side's confidential brief and the hidden numbers appear only once you have joined.",
      ]) {
        await expect(page.getByText(text, { exact: true })).toBeVisible();
      }
      await expect(page.getByRole('link', { name: 'Sign up and practise', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'I have an account', exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`step-3-${viewport.name}.png`), fullPage: true });
      await followLink('Sign up and practise', '/register', sharePath, `${sharePath}?join=1`);
      await followLink('I have an account', '/login', sharePath, `${sharePath}?join=1`);
    }
  });

  await test.step('Open a share link that is not active: see "This scenario link is not active." and "What is Persuaider?" in the new look', async () => {
    // Generated codes are eight hex characters, so this code cannot be generated.
    const missingPath = '/s/E2E-NEVER-EXISTED';
    await page.setViewportSize(viewports[0]);
    await page.goto(missingPath);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await expect(page.getByText('This scenario link is not active.', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'What is Persuaider?', exact: true })).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`step-4-${viewport.name}.png`), fullPage: true });
      await page.getByRole('link', { name: 'What is Persuaider?', exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === '/');
      await checkHome();
      await page.goto(missingPath);
    }
  });
});
