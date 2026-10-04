import { test, expect } from '@playwright/test';
import { loginAsDemo, loginAsAdmin } from '../helpers';

test.describe.configure({ retries: 0 });

test('the dashboard reopens the signed-in person’s most recently finished AI run report', async ({ page, browser }) => {
  test.setTimeout(1800000);
  await loginAsDemo(page);

  // Arrange private scenarios through the same API as the reference test.
  // All runs and reports below are exercised through the UI, with real AI.
  const title = `E2E Last AI run ${Date.now()}`;
  const createScenario = async (scenarioTitle: string, withIssues = true) => {
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
        winCondition: { type: 'manual', maxMessages: 4 },
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
          initialGreeting: 'Let us discuss the rent.',
        }],
      },
    });
    expect(created.ok()).toBe(true);
    return (await created.json()).scenario as { id: string; joinCode: string };
  };

  const scored = await createScenario(title);
  const unscored = await createScenario(`${title} without numbers`, false);
  const concurrent = await createScenario(`${title} overlapping runs`);
  const untouched = await createScenario(`${title} never run`);

  const dashboard = async (target = page) => {
    await target.goto('/dashboard');
    await expect(target.getByRole('heading', { name: 'Your Training Dashboard', exact: true })).toBeVisible();
  };

  const startRun = async (id: string) => {
    const start = page.getByTestId(`run-ai-vs-ai-${id}`)
      .and(page.getByRole('button', { name: 'Run AI vs AI', exact: true }));
    await expect(start).toHaveText('Run AI vs AI');
    await start.click();
    // Use the dialog's given accessible label, without imposing dialog markup.
    await page.getByLabel('Run AI vs AI', { exact: true })
      .getByRole('button', { name: 'Lou the Landlord', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/run/') && !url.pathname.endsWith('/report'));
    return page.url();
  };

  const finishRun = async () => {
    const outcome = page.getByTestId('run-outcome');
    const turns = page.getByTestId('run-message').filter({ visible: true });
    // Allow a full minute for each real AI reply, including the final outcome.
    while (!(await outcome.isVisible())) {
      const count = await turns.count();
      await expect.poll(async () =>
        await outcome.isVisible() || (await turns.count()) > count,
      { timeout: 60000, message: 'The next AI turn or finished-run outcome appears' }).toBe(true);
    }
    expect(['Deal reached', 'No deal', 'Message limit reached']).toContain((await outcome.innerText()).trim());
  };

  const readReport = async (scenarioTitle: string, withIssues: boolean) => {
    const heading = page.getByTestId('report-title');
    await expect(heading.and(page.getByRole('heading', { level: 1, name: scenarioTitle, exact: true }))).toBeVisible();
    await expect(heading).toHaveText(scenarioTitle);
    const result = page.getByTestId('report-result');
    await expect(result).toBeVisible();
    const resultText = (await result.innerText()).trim();
    expect(withIssues ? ['Deal reached', 'No deal'] : ['Unscored']).toContain(resultText);

    const deal = page.getByTestId('report-deal');
    const rows = deal.getByTestId('report-deal-issue');
    if (withIssues) {
      await expect(deal.getByRole('heading', { name: 'Deal', exact: true })).toBeVisible();
      await expect(rows).toHaveCount(1);
      await expect(rows).toBeVisible();
      await expect(rows.getByTestId('report-deal-issue-name')).toHaveText('Monthly rent');
    }
    const feedback = page.getByTestId('report-feedback');
    await expect(feedback).toBeVisible();
    const wentWell = feedback.getByTestId('report-went-well').getByTestId('report-point');
    const goneBetter = feedback.getByTestId('report-gone-better').getByTestId('report-point');
    const unavailable = "Feedback couldn't be written for this run.";
    const feedbackMissing = (await feedback.innerText()).trim() === unavailable;
    if (feedbackMissing) {
      await expect(feedback).toHaveText(unavailable);
    } else {
      await expect(feedback.getByRole('heading', { name: 'What went well', exact: true })).toBeVisible();
      await expect(feedback.getByRole('heading', { name: 'What could have gone better', exact: true })).toBeVisible();
      expect(await wentWell.count()).toBeGreaterThan(0);
      expect(await goneBetter.count()).toBeGreaterThan(0);
      for (const point of await feedback.getByTestId('report-point').all()) {
        await expect(point).toBeVisible();
      }
    }
    // Capture visible words, not response data or guessed AI prose.
    return {
      url: page.url(), title: scenarioTitle, result: resultText,
      rows: await rows.allInnerTexts(), feedbackMissing,
      wentWell: await wentWell.allInnerTexts(), goneBetter: await goneBetter.allInnerTexts(),
    };
  };

  const seeReport = async (runUrl: string, scenarioTitle: string, withIssues = true) => {
    await page.getByTestId('see-report')
      .and(page.getByRole('button', { name: 'See report', exact: true })).click();
    await expect(page).toHaveURL(`${runUrl}/report`);
    return readReport(scenarioTitle, withIssues);
  };

  type SavedReport = Awaited<ReturnType<typeof readReport>>;
  const lastRun = (id: string) => page.getByTestId(`last-ai-run-${id}`);
  const expectLastRun = async (id: string, report: SavedReport) => {
    await expect(lastRun(id)).toHaveCount(1);
    await expect(lastRun(id).and(page.getByRole('link', {
      name: `Last AI run: ${report.result}`, exact: true,
    }))).toBeVisible();
    await expect(lastRun(id)).toHaveText(`Last AI run: ${report.result}`);
  };
  const reopenReport = async (id: string, report: SavedReport, withIssues = true) => {
    await expectLastRun(id, report);
    await lastRun(id).click();
    await expect(page).toHaveURL(report.url);
    const reopened = await readReport(report.title, withIssues);
    expect(reopened.result).toBe(report.result);
    // Playwright normalises layout whitespace but compares the saved words exactly.
    await expect(page.getByTestId('report-deal').getByTestId('report-deal-issue'))
      .toHaveText(report.rows, { useInnerText: true });
    expect(reopened.feedbackMissing).toBe(report.feedbackMissing);
    const feedback = page.getByTestId('report-feedback');
    await expect(feedback.getByTestId('report-went-well').getByTestId('report-point'))
      .toHaveText(report.wentWell, { useInnerText: true });
    await expect(feedback.getByTestId('report-gone-better').getByTestId('report-point'))
      .toHaveText(report.goneBetter, { useInnerText: true });
  };

  let scoredReport: SavedReport;
  let unscoredReport: SavedReport;

  await test.step("Finish a run, go back to the dashboard; under that scenario, Last AI run shows the run's result: Deal reached or No deal", async () => {
    await dashboard();
    const runUrl = await startRun(scored.id);
    await finishRun();
    scoredReport = await seeReport(runUrl, title);
    await dashboard();
    await expectLastRun(scored.id, scoredReport);

    const unscoredUrl = await startRun(unscored.id);
    await finishRun();
    unscoredReport = await seeReport(unscoredUrl, `${title} without numbers`, false);
    await dashboard();
    await expectLastRun(scored.id, scoredReport);
    await expectLastRun(unscored.id, unscoredReport);
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step('Click Last AI run; the page is the same report that See report opened, with the same title, result, Deal rows and feedback', async () => {
    await reopenReport(unscored.id, unscoredReport, false);
    await dashboard();
    await reopenReport(scored.id, scoredReport);
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });

  await test.step("Start run A, then start run B; finish B first, then finish A; Last AI run now points to A's report, the run that finished most recently", async () => {
    await dashboard();
    const runA = await startRun(concurrent.id);
    // Leave A's page immediately: only the open run page advances its run.
    await dashboard();
    await expect(page.getByTestId(`run-ai-vs-ai-${concurrent.id}`)).toBeVisible();
    await expect(lastRun(concurrent.id)).not.toBeVisible();
    const runB = await startRun(concurrent.id);
    expect(runB).not.toBe(runA);
    await finishRun();
    const reportB = await seeReport(runB, `${title} overlapping runs`);
    await dashboard();
    await reopenReport(concurrent.id, reportB);

    // Reopen the saved address of A, and watch it finish after B.
    await page.goto(runA);
    await finishRun();
    const reportA = await seeReport(runA, `${title} overlapping runs`);
    await dashboard();
    // No reload, refresh action, or deliberate wait for a dashboard polling cycle.
    await reopenReport(concurrent.id, reportA);
    await page.screenshot({ path: test.info().outputPath('step-3.png') });
  });

  await test.step('A scenario you have never run AI vs AI shows no Last AI run', async () => {
    await dashboard();
    await expect(page.getByTestId(`run-ai-vs-ai-${untouched.id}`)).toBeVisible();
    await expect(lastRun(untouched.id)).not.toBeVisible();

    // The same scenario has finished runs for Demo, but none for this member.
    // Joining is fixture setup; the assertion is on that member's dashboard.
    const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      const otherPage = await otherContext.newPage();
      await loginAsAdmin(otherPage);
      const joined = await otherPage.request.post('/api/scenarios/join', {
        data: { joinCode: scored.joinCode },
      });
      expect(joined.ok()).toBe(true);
      await dashboard(otherPage);
      await expect(otherPage.getByTestId(`run-ai-vs-ai-${scored.id}`)).toBeVisible();
      await expect(otherPage.getByTestId(`last-ai-run-${scored.id}`)).not.toBeVisible();
      await otherPage.screenshot({ path: test.info().outputPath('step-4.png') });
    } finally {
      await otherContext.close();
    }
  });
});
