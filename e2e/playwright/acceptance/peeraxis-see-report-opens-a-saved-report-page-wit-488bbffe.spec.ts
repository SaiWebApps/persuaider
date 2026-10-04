import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

test('See report opens the saved result and all turns of an AI vs AI run', async ({ page }) => {
  test.setTimeout(720000);
  await loginAsDemo(page);

  const title = `E2E Saved run report ${Date.now()}`;
  const unscoredTitle = `${title} without issues`;
  const greeting = 'Let us discuss the lease.';

  // Arrange scenarios just as the reference acceptance test does. Both runs
  // themselves are started and observed through the product, using real AI.
  const createScenario = async (scenarioTitle: string, withIssues: boolean) => {
    const created = await page.request.post('/api/scenarios', {
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
        winCondition: { type: 'manual', maxMessages: 2 },
        issues: withIssues ? [{
          name: 'Monthly rent',
          unit: 'USD',
          learnerWants: 'lower',
          learner: { target: 1500, reservation: 1700, weight: 100 },
          counterpart: { target: 1900, reservation: 1600, weight: 100 },
        }] : [],
        personas: [{
          name: 'Lou the Landlord',
          roleType: 'Landlord',
          roleName: 'Landlord',
          description: 'Firm but fair.',
          initialGreeting: greeting,
        }],
      },
    });
    expect(created.ok()).toBe(true);
    const { scenario } = await created.json();
    return scenario.id as string;
  };

  const scenarioId = await createScenario(title, true);
  const unscoredScenarioId = await createScenario(unscoredTitle, false);

  const finishRun = async (id: string) => {
    await page.goto('/dashboard');
    const start = page.getByTestId(`run-ai-vs-ai-${id}`);
    await expect(start).toBeVisible();
    await expect(start).toHaveText('Run AI vs AI');
    await expect(start).toHaveAccessibleName('Run AI vs AI');
    await start.click();
    await page.getByRole('button', { name: 'Lou the Landlord', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/run/') && !url.pathname.endsWith('/report'));
    const runUrl = page.url();
    const messages = page.getByTestId('run-message').filter({ visible: true });
    const outcome = page.getByTestId('run-outcome');

    // Each new visible turn gets its own minute; do not depend on AI wording
    // or require the browser to catch every intermediate render.
    while (!(await outcome.isVisible())) {
      const count = await messages.count();
      await expect.poll(async () =>
        await outcome.isVisible() || (await messages.count()) > count,
      { timeout: 60000, message: 'The next AI turn or final outcome appears' }).toBe(true);
    }
    const result = (await outcome.innerText()).trim();
    expect(['Deal reached', 'No deal', 'Message limit reached']).toContain(result);
    const turns = (await messages.allInnerTexts()).map(text =>
      text.split('\n').map(line => line.trim()).filter(Boolean).join(' '));
    expect(turns.length).toBeGreaterThan(1);
    // Inspect the collection in spoken order, without locating items by position.
    for (const [index, turn] of turns.entries()) {
      const label = index % 2 === 0 ? 'Landlord' : 'Tenant (You play)';
      expect(turn.startsWith(`${label} `)).toBe(true);
      expect(turn.slice(label.length).trim().length).toBeGreaterThan(0);
    }
    expect(turns[0]).toBe(`Landlord ${greeting}`);
    return { runUrl, result, turns };
  };

  const openReport = async (runUrl: string, scenarioTitle: string, result: string) => {
    const reportButton = page.getByRole('button', { name: 'See report', exact: true })
      .and(page.getByTestId('see-report'));
    await expect(reportButton).toBeVisible();
    await reportButton.click();
    const reportUrl = new URL(runUrl);
    reportUrl.pathname += '/report';
    await page.waitForURL(reportUrl.href);
    await expect(page.getByTestId('report-title')).toBeVisible();
    await expect(page.getByTestId('report-title')).toHaveText(scenarioTitle);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: scenarioTitle, exact: true })
      .and(page.getByTestId('report-title'))).toBeVisible();
    await expect(page.getByTestId('report-result')).toBeVisible();
    await expect(page.getByTestId('report-result')).toHaveText(result);
  };

  const expectReportTurns = async (turns: string[]) => {
    const transcript = page.getByTestId('report-turns');
    await expect(transcript).toBeVisible();
    const messages = transcript.getByTestId('run-message');
    await expect(messages).toHaveCount(turns.length);
    // Exact captured text checks the labels, complete replies, and spoken order
    // without guessing what the real AI will say or imposing list markup.
    await expect(messages).toHaveText(turns, { useInnerText: true });
    for (const message of await messages.all()) {
      await expect(message).toBeVisible();
    }
  };

  let savedTurns: string[] = [];
  let savedResult = '';

  await test.step('Run AI vs AI to the end exactly as before, then click See report; the page is titled with the scenario name and shows the run\'s result: Deal reached or No deal', async () => {
    const run = await finishRun(scenarioId);
    savedTurns = run.turns;
    savedResult = run.result === 'Deal reached' ? 'Deal reached' : 'No deal';
    await openReport(run.runUrl, title, savedResult);
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step('On the same report page, every turn from the run appears in order, each labelled with the side that said it, just as it looked on the run page', async () => {
    await expectReportTurns(savedTurns);
    // Reopening the address also checks this is a saved report, not transient
    // text that is available only immediately after clicking See report.
    await page.reload();
    await expect(page.getByTestId('report-title')).toBeVisible();
    await expect(page.getByTestId('report-title')).toHaveText(title);
    await expect(page.getByTestId('report-result')).toBeVisible();
    await expect(page.getByTestId('report-result')).toHaveText(savedResult);
    await expectReportTurns(savedTurns);
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });

  await test.step('Run a scenario that has no numbers; the report says Unscored and still shows the turns', async () => {
    const run = await finishRun(unscoredScenarioId);
    expect(['No deal', 'Message limit reached']).toContain(run.result);
    await openReport(run.runUrl, unscoredTitle, 'Unscored');
    await expectReportTurns(run.turns);
    await page.screenshot({ path: test.info().outputPath('step-3.png') });
  });
});
