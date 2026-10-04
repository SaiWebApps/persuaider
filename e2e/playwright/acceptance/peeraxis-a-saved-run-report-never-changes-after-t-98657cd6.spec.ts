import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

test('a saved run report stays unchanged after its scenario is edited', async ({ page }) => {
  test.setTimeout(600000);
  await loginAsDemo(page);

  const title = `E2E Immutable run report ${Date.now()}`;
  const editedTitle = `${title} revised`;
  const normalise = (text: string) => text.split(/\s+/).filter(Boolean).join(' ');

  // Use the reference test's public-API arrangement; run and edit through the UI.
  // The AI is real, so record its visible words rather than predicting them.
  const created = await page.request.post('/api/scenarios', {
    data: {
      title,
      description: 'Negotiate a commercial lease. Seek a practical agreement promptly.',
      userRole: 'Tenant',
      aiRole: 'Landlord',
      learnerRoleName: 'Tenant',
      roles: [
        { name: 'Tenant', description: 'Keep the lease affordable.' },
        { name: 'Landlord', description: 'Protect the building value.' },
      ],
      winCondition: { type: 'manual', maxMessages: 2 },
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

  const heading = page.getByTestId('report-title');
  const result = page.getByTestId('report-result');
  const turns = page.getByTestId('report-turns').getByTestId('run-message');
  const deal = page.getByTestId('report-deal');
  const rows = deal.getByTestId('report-deal-issue');
  const titleBox = page.getByTestId('edit-title');
  const targetBox = page.getByTestId('issue-0-counterpart-target');
  const walkAwayBox = page.getByTestId('issue-0-counterpart-reservation');
  const openEditor = async () => {
    await page.goto('/dashboard');
    await page.getByTestId(`edit-scenario-${scenario.id}`)
      .and(page.getByRole('link', { name: 'Edit', exact: true })).click();
    await expect(titleBox).toBeVisible();
  };
  const readReport = async () => ({
    heading: normalise(await heading.innerText()),
    result: normalise(await result.innerText()),
    turns: (await turns.allInnerTexts()).map(normalise),
    rows: (await rows.allInnerTexts()).map(normalise),
  });
  let reportAddress = '';
  let saved: Awaited<ReturnType<typeof readReport>>;

  await test.step('Run AI vs AI to the end, click See report and note the heading, labels and Deal rows', async () => {
    await page.goto('/dashboard');
    await page.getByTestId(`run-ai-vs-ai-${scenario.id}`)
      .and(page.getByRole('button', { name: 'Run AI vs AI', exact: true })).click();
    await page.getByRole('button', { name: 'Lou the Landlord', exact: true }).click();
    const seeReport = page.getByTestId('see-report')
      .and(page.getByRole('button', { name: 'See report', exact: true }));
    const liveTurns = page.getByTestId('run-message');
    // Allow a fresh minute for each AI reply or for the finished-run control.
    while (!(await seeReport.isVisible())) {
      const count = await liveTurns.count();
      await expect.poll(async () =>
        await seeReport.isVisible() || (await liveTurns.count()) > count,
      { timeout: 60000, message: 'The next AI reply or See report appears' }).toBe(true);
    }
    await seeReport.click();
    await expect(result).toBeVisible({ timeout: 60000 });
    reportAddress = page.url();
    await expect(heading).toHaveText(title);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(heading.and(page.getByRole('heading', {
      level: 1, name: title, exact: true,
    }))).toBeVisible();
    expect(['Deal reached', 'No deal', 'Unscored']).toContain(normalise(await result.innerText()));
    await expect(page.getByTestId('report-turns')).toBeVisible();
    await expect.poll(() => turns.count()).toBeGreaterThan(1);
    for (const turn of await turns.all()) {
      await expect(turn).toBeVisible();
      const text = normalise(await turn.innerText());
      const labels = ['Landlord', 'Tenant (You play)'];
      expect(labels.some(label => text.startsWith(`${label} `) && text.length > label.length + 1)).toBe(true);
    }
    await expect(deal).toBeVisible();
    await expect(deal.getByRole('heading', { name: 'Deal', exact: true })).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows).toBeVisible();
    await expect(rows.getByTestId('report-deal-issue-name')).toHaveText('Monthly rent');
    await expect(rows.getByTestId('report-deal-their-target')).toBeVisible();
    await expect(rows.getByTestId('report-deal-their-target')).toHaveText('$1,900');
    await expect(rows.getByTestId('report-deal-their-walk-away')).toBeVisible();
    await expect(rows.getByTestId('report-deal-their-walk-away')).toHaveText('$1,600');
    await expect(rows).toContainText('Their hidden target');
    await expect(rows).toContainText('Their hidden walk-away');
    await expect(rows).toContainText('Left on the table');
    saved = await readReport();
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step('Edit the scenario\'s title and an issue\'s numbers, then reopen the same report: the heading, labels and Deal rows are unchanged from before the edit', async () => {
    await openEditor();
    await expect(titleBox).toHaveValue(title);
    await expect(targetBox).toHaveValue('1900');
    await expect(walkAwayBox).toHaveValue('1600');
    await titleBox.fill(editedTitle);
    // Landlord still wants higher; its target remains above its walk-away.
    await targetBox.fill('2000');
    await walkAwayBox.fill('1650');
    await page.getByTestId('edit-save')
      .and(page.getByRole('button', { name: 'Save', exact: true })).click();
    await expect(page.getByTestId('edit-saved')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('edit-saved')).toHaveText('Saved.');

    // Confirm persistence in the editor before inspecting the saved report.
    await openEditor();
    await expect(titleBox).toHaveValue(editedTitle);
    await expect(targetBox).toHaveValue('2000');
    await expect(walkAwayBox).toHaveValue('1650');

    await page.goto(reportAddress);
    await expect(result).toBeVisible({ timeout: 60000 });
    await expect(heading).toBeVisible();
    await expect(page.getByTestId('report-turns')).toBeVisible();
    await expect(deal).toBeVisible();
    await expect(turns).toHaveCount(saved.turns.length);
    await expect(rows).toHaveCount(saved.rows.length);
    for (const turn of await turns.all()) await expect(turn).toBeVisible();
    for (const row of await rows.all()) await expect(row).toBeVisible();
    // Arrays compare every full turn and Deal row, including all labels and
    // figures, after collapsing whitespace; no AI wording is hard-coded.
    await expect.poll(readReport).toEqual(saved);
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });
});
