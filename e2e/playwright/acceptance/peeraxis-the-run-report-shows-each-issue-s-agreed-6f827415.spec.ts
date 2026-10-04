import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

test('a finished AI run reports its Deal figures and keeps numberless runs Unscored', async ({ page }) => {
  test.setTimeout(600000);
  await loginAsDemo(page);

  const issues = [
    { name: 'Monthly rent', unit: 'USD', learnerWants: 'lower',
      learner: { target: 1500, reservation: 1700, weight: 50 },
      counterpart: { target: 1900, reservation: 1600, weight: 50 } },
    { name: 'Annual increase', unit: '%', learnerWants: 'lower',
      learner: { target: 2, reservation: 5, weight: 25 },
      counterpart: { target: 6, reservation: 3, weight: 25 } },
    { name: 'Fit-out allowance', unit: 'credits', learnerWants: 'higher',
      learner: { target: 2500, reservation: 1000, weight: 25 },
      counterpart: { target: 1200, reservation: 2000, weight: 25 } },
  ];
  const format = (value: number, unit: string) => {
    const number = value.toLocaleString('en-US');
    return unit === 'USD' ? `$${number}` : unit === '%' ? `${number}%` : `${number} ${unit}`;
  };
  const normalise = (text: string) => text.split(/\s+/).filter(Boolean).join(' ');

  // As in the reference test, create our own scenario through the public API.
  // Starting a run is setup; all report observations are made in the browser.
  // No replies, extracted outcomes or report responses are mocked or inspected.
  const watchRun = async (withNumbers: boolean) => {
    const created = await page.request.post('/api/scenarios', {
      data: {
        title: `E2E Deal report ${withNumbers ? 'lease' : 'conversation'} ${Date.now()}`,
        description: withNumbers
          ? 'Negotiate monthly rent, annual increase and a fit-out allowance. Try to agree a complete package promptly.'
          : 'Discuss how the tenant and landlord can communicate considerately. There are no numerical terms to negotiate.',
        userRole: 'Tenant', aiRole: 'Landlord', learnerRoleName: 'Tenant',
        roles: [
          { name: 'Tenant', description: 'Seek a practical agreement promptly.' },
          { name: 'Landlord', description: 'Seek a practical agreement promptly.' },
        ],
        winCondition: { type: 'manual', maxMessages: 2 },
        issues: withNumbers ? issues : [],
        personas: [{ name: 'Lou the Landlord', roleType: 'Landlord', roleName: 'Landlord',
          description: 'Cooperative and ready to find common ground.',
          initialGreeting: withNumbers
            ? 'I propose monthly rent of $1,650, an annual increase of 3%, and a fit-out allowance of 2,000 credits.'
            : 'Let us discuss how to communicate considerately.' }],
      },
    });
    expect(created.ok()).toBe(true);
    const { scenario } = await created.json();
    const people = await page.request.get(`/api/personas?scenarioId=${scenario.id}`);
    expect(people.ok()).toBe(true);
    const { personas } = await people.json();
    const persona = personas.find((person: { name: string }) => person.name === 'Lou the Landlord');
    expect(persona).toBeTruthy();
    const started = await page.request.post('/api/runs', { data: { personaId: persona.id } });
    expect(started.ok()).toBe(true);
    const { run } = await started.json();
    await page.goto(`/run/${run.id}`);

    const messages = page.getByTestId('run-message');
    const seeReport = page.getByRole('button', { name: 'See report', exact: true });
    let count = 0;
    while (!(await seeReport.isVisible())) {
      await expect.poll(async () => (await messages.count()) > count || await seeReport.isVisible(),
        { timeout: 60000, message: 'The next AI reply or See report appears within a minute' }).toBe(true);
      count = await messages.count();
    }
    const transcript = (await messages.allInnerTexts()).map(normalise);
    expect(transcript.length).toBeGreaterThan(1);
    await seeReport.click();
    await expect(page.getByTestId('report-result')).toBeVisible();
    return transcript;
  };

  const deal = page.getByTestId('report-deal');
  const rows = deal.getByTestId('report-deal-issue');

  await test.step('Run AI vs AI to the end, click See report; under Deal, each issue shows the agreed figure beside Their hidden target, Their hidden walk-away and Left on the table', async () => {
    await watchRun(true);
    const result = (await page.getByTestId('report-result').innerText()).trim();
    expect(['Deal reached', 'No deal']).toContain(result);
    await expect(deal).toBeVisible();
    await expect(deal.getByRole('heading', { name: 'Deal', exact: true })).toHaveText('Deal');
    await expect(rows).toHaveCount(issues.length);
    // Assert the collection's issue order, but locate each block by its own name.
    await expect(rows.getByTestId('report-deal-issue-name')).toHaveText(issues.map(issue => issue.name));
    for (const issue of issues) {
      const row = rows.filter({ has: page.getByText(issue.name, { exact: true }) });
      await expect(row).toBeVisible();
      await expect(row.getByTestId('report-deal-issue-name')).toHaveText(issue.name);
      for (const label of ['Their hidden target', 'Their hidden walk-away', 'Left on the table']) {
        await expect(row.getByText(label, { exact: true })).toBeVisible();
      }
      const target = format(issue.counterpart.target, issue.unit);
      const walkAway = format(issue.counterpart.reservation, issue.unit);
      await expect(row.getByTestId('report-deal-their-target')).toBeVisible();
      await expect(row.getByTestId('report-deal-their-target')).toHaveText(target);
      await expect(row.getByTestId('report-deal-their-walk-away')).toBeVisible();
      await expect(row.getByTestId('report-deal-their-walk-away')).toHaveText(walkAway);
      const agreed = row.getByTestId('report-deal-agreed');
      const left = row.getByTestId('report-deal-left-on-table');
      await expect(agreed).toBeVisible();
      await expect(left).toBeVisible();
      const agreedText = (await agreed.innerText()).trim();
      let leftText = '—';
      if (result === 'No deal' || agreedText === 'No agreement') {
        await expect(agreed).toHaveText('No agreement');
      } else {
        // The real AI chooses the agreement. Check the displayed number's exact
        // formatting and the arithmetic, without guessing the AI's prose or price.
        const value = Number(agreedText.replaceAll(',', '').replace('$', '').replace('%', '').replace(` ${issue.unit}`, ''));
        expect(Number.isFinite(value)).toBe(true);
        await expect(agreed).toHaveText(format(value, issue.unit));
        const amount = issue.learnerWants === 'lower'
          ? Math.max(0, value - issue.counterpart.reservation)
          : Math.max(0, issue.counterpart.reservation - value);
        leftText = format(amount, issue.unit);
      }
      await expect(left).toHaveText(leftText);
    }
    const savedRows = (await rows.allInnerTexts()).map(normalise);
    await page.reload();
    await expect(page.getByTestId('report-result')).toHaveText(result);
    await expect(deal).toBeVisible();
    await expect.poll(async () => (await rows.allInnerTexts()).map(normalise)).toEqual(savedRows);
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step('The words Revealed after your second attempt appear nowhere on the page', async () => {
    await expect(page.getByText('Revealed after your second attempt', { exact: false })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });

  await test.step('Run a scenario that has no numbers; the report still says Unscored and shows the turns, with no Deal rows', async () => {
    const transcript = await watchRun(false);
    await expect(page.getByTestId('report-result')).toHaveText('Unscored');
    await expect(deal).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Deal', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('report-deal-issue')).toHaveCount(0);
    const turns = page.getByTestId('report-turns');
    await expect(turns).toBeVisible();
    const reportMessages = turns.getByTestId('run-message');
    await expect(reportMessages).toHaveCount(transcript.length);
    expect((await reportMessages.allInnerTexts()).map(normalise)).toEqual(transcript);
    transcript.forEach((text, index) => {
      const label = index % 2 === 0 ? 'Landlord' : 'Tenant (You play)';
      expect(text.startsWith(`${label} `)).toBe(true);
      expect(text.slice(label.length).trim().length).toBeGreaterThan(0);
    });
    for (const message of await reportMessages.all()) await expect(message).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('step-3.png') });
  });
});
