import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

type Issue = {
  name: string; unit?: string; agreed: number | null;
  learnerTarget: number; learnerReservation: number; counterpartReservation: number;
  learnerLastAsk: number | null; counterpartLastOffer: number | null;
  learnerCapture: number | null; leftOnTable: number | null;
};
type Summary = {
  overallScore: number | null;
  deal: string | null;
  llmFeedback: string | null;
  frameworkScores: string | null;
};

const figure = (value: number | null, unit?: string) => {
  if (value === null) return '—';
  const number = value.toLocaleString('en-US');
  if (unit === 'USD' || unit === '$') return `$${number}`;
  if (unit === '%') return `${number}%`;
  return unit ? `${number} ${unit}` : number;
};

test('the feedback summary presents the verdict, comparable issue numbers and clear feedback on laptop and phone', async ({ page }) => {
  test.setTimeout(600000);
  await loginAsDemo(page);
  const title = 'E2E Summary lease';
  const counterpart = 'Lou the Landlord';
  const created = await page.request.post('/api/scenarios', {
    data: {
      title, description: 'Negotiate monthly rent and the annual rent increase for a commercial lease.',
      userRole: 'Tenant', aiRole: 'Landlord', learnerRoleName: 'Tenant',
      roles: [
        { name: 'Tenant', description: 'Seek an affordable lease.' },
        { name: 'Landlord', description: 'Protect the building value.' },
      ],
      issues: [
        { name: 'Monthly rent', unit: 'USD', learnerWants: 'lower',
          learner: { target: 1500, reservation: 1700, weight: 70 },
          counterpart: { target: 1900, reservation: 1600, weight: 70 } },
        { name: 'Annual increase', unit: '%', learnerWants: 'lower',
          learner: { target: 2, reservation: 4, weight: 30 },
          counterpart: { target: 5, reservation: 3, weight: 30 } },
      ],
      personas: [{ name: counterpart, roleType: 'Landlord', roleName: 'Landlord',
        description: 'Firm but fair. Seek a practical agreement.',
        initialGreeting: 'Let us discuss the rent and annual increase.' }],
    },
  });
  expect(created.ok()).toBe(true);
  const { scenario } = await created.json();
  const people = await page.request.get(`/api/personas?scenarioId=${scenario.id}`);
  expect(people.ok()).toBe(true);
  const { personas } = await people.json();
  const persona = personas.find((person: { name: string }) => person.name === counterpart);
  expect(persona).toBeTruthy();

  // Prepare real conversations through public APIs, as in the reference test.
  // A prior completed attempt makes the numbers available; the reveal rule is
  // deliberately not asserted. Nothing intercepts or replaces the real AI.
  const start = async (): Promise<string> => {
    const response = await page.request.post('/api/conversations', {
      data: { personaId: persona.id, scenarioId: scenario.id },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).conversation.id;
  };
  const say = async (id: string, content: string) => {
    const response = await page.request.post(`/api/conversations/${id}/messages`, {
      data: { content }, timeout: 60000,
    });
    expect(response.ok()).toBe(true);
  };
  const finish = async (id: string): Promise<Summary> => {
    // Deal extraction and coaching are two live AI operations.
    const response = await page.request.post(`/api/conversations/${id}/summary`, { timeout: 180000 });
    expect(response.ok()).toBe(true);
    return (await response.json()).summary;
  };
  const previous = await start();
  await say(previous, 'I propose $1,650 monthly rent and a 3% annual increase. Could that work for you?');
  await finish(previous);
  const current = await start();
  await say(current, 'Comparable spaces rent for $1,600. I can pay $1,650 per month with a 3% annual increase, and offer reliable payments. What matters most to you?');
  await say(current, 'My final proposal is $1,650 monthly rent with a 3% annual increase. Can we agree to those two figures?');

  const summaryUrl = `/persona/${persona.id}/summary`;
  let summary: Summary;
  let deal: { reached: boolean; issues: Issue[] };

  await test.step('End a negotiation: the summary opens with the counterpart\'s name, the scenario title, "You played: …", your score shown large with "/100", and "Deal reached" or "No deal" in the first screenful', async () => {
    summary = await finish(current);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(summaryUrl);
    await expect(page).toHaveTitle('Summary · Persuaider');
    await expect(page.getByTestId('counterpart-name')).toHaveText(counterpart);
    await expect(page.getByRole('heading', { name: counterpart, exact: true })).toBeVisible();
    await expect(page.getByTestId('scenario-title')).toHaveText(title);
    await expect(page.getByTestId('scenario-title')).toBeVisible();
    await expect(page.getByTestId('played-as')).toHaveText('You played: Tenant');
    await expect(page.getByTestId('played-as')).toBeVisible();
    if (summary.overallScore === null) {
      await expect(page.getByTestId('not-scored')).toBeVisible();
      expect((await page.getByTestId('not-scored').innerText()).startsWith('Not scored')).toBe(true);
      await expect(page.getByTestId('score')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('score')).toHaveText(`${summary.overallScore}/100`);
      await expect(page.getByTestId('score')).toBeVisible();
      await expect(page.getByTestId('score').getByTestId('overall-score')).toHaveText(String(summary.overallScore));
    }
    expect(summary.deal, 'Live deal extraction must be available to exercise the issue presentation').not.toBeNull();
    deal = JSON.parse(summary.deal!);
    await expect(page.getByTestId('deal-status')).toHaveText(deal.reached ? 'Deal reached' : 'No deal');
    await expect(page.getByTestId('deal-status')).toBeVisible();
    // First-screen placement, type size, palette and decorative marks are
    // reviewed in screenshots, not constrained by DOM geometry or CSS.
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: test.info().outputPath('step-1-phone.png') });
  });

  await test.step('Under "Deal", each issue shows "Your target", "Your walk-away", "Their hidden limit" and "Your last ask / their last offer" lined up in a table; on a phone every label and its number stay on one row', async () => {
    const outcome = page.getByTestId('deal-outcome');
    await expect(outcome.getByRole('heading', { name: 'Deal', exact: true })).toBeVisible();
    await expect(outcome.getByTestId('deal-issue')).toHaveCount(2);
    for (const name of ['Monthly rent', 'Annual increase']) {
      const data = deal.issues.find(issue => issue.name === name)!;
      expect(data).toBeTruthy();
      const issue = outcome.getByTestId('deal-issue').filter({
        has: page.getByTestId('deal-issue-name').filter({ hasText: name }),
      });
      await expect(issue.getByTestId('deal-issue-name')).toHaveText(name);
      await expect(issue.getByTestId('deal-agreed')).toHaveText(data.agreed === null ? 'No agreement' : figure(data.agreed, data.unit));
      await expect(issue.getByTestId('deal-agreed')).toBeVisible();
      const rows: [string, string][] = [
        ['Your target', name === 'Monthly rent' ? '$1,500' : '2%'],
        ['Your walk-away', name === 'Monthly rent' ? '$1,700' : '4%'],
        ['Their hidden limit', name === 'Monthly rent' ? '$1,600' : '3%'],
        ['Your last ask / their last offer', `${figure(data.learnerLastAsk, data.unit)} / ${figure(data.counterpartLastOffer, data.unit)}`],
      ];
      if (data.learnerCapture !== null) rows.push(['Share of your range captured', `${data.learnerCapture}%`]);
      if (data.leftOnTable !== null && data.leftOnTable > 0) rows.push(['Left on the table', figure(data.leftOnTable, data.unit)]);
      for (const [label, value] of rows) {
        const row = issue.getByTestId('deal-row').filter({ has: page.getByText(label, { exact: true }) });
        await expect(row.getByText(label, { exact: true })).toBeVisible();
        await expect(row.getByText(value, { exact: true })).toBeVisible();
        if (label === 'Their hidden limit') await expect(row.getByTestId('hidden-limit')).toHaveText(value);
      }
    }
    await outcome.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('step-2.png'), fullPage: true });
  });

  await test.step('"Did the opponent feel real?" with buttons 1 to 5 sits near the top where you see it without hunting; "What Went Well", "What To Improve" and "Suggestions" appear as lists with one small mark per line', async () => {
    await page.goto(summaryUrl);
    const rating = page.getByTestId('felt-real');
    await expect(rating.getByRole('heading', { name: 'Did the opponent feel real?', exact: true })).toBeVisible();
    for (const value of ['1', '2', '3', '4', '5']) {
      await expect(rating.getByRole('button', { name: value, exact: true })).toBeVisible();
      await expect(rating.getByTestId(`felt-real-${value}`)).toHaveText(value);
    }
    await rating.getByRole('button', { name: '4', exact: true }).click();
    await expect(rating.getByTestId('felt-real-thanks')).toHaveText('Thanks. Your answer: 4/5.');

    const feedback = summary.llmFeedback ? JSON.parse(summary.llmFeedback) : {};
    for (const [id, heading, key] of [
      ['went-well', 'What Went Well', 'whatWentWell'],
      ['to-improve', 'What To Improve', 'whatToImprove'],
      ['suggestions', 'Suggestions', 'specificSuggestions'],
    ]) {
      const points: string[] = feedback[key] ?? [];
      const list = page.getByTestId(id);
      if (!points.length) {
        await expect(list).toHaveCount(0);
        continue;
      }
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(list.getByTestId('feedback-point')).toHaveCount(points.length);
      // Compare presentation to returned sentences, never grade what the AI wrote.
      const displayed: string[] = [];
      for (const point of await list.getByTestId('feedback-point').all()) {
        await expect(point).toBeVisible();
        const sentence = (await point.innerText()).trim();
        displayed.push(sentence);
        expect(['+', '-', '*'].includes(sentence.charAt(0))).toBe(false);
      }
      expect(displayed.sort()).toEqual(points.map(sentence => sentence.trim()).sort());
    }
    const frameworks: Record<string, number> = summary.frameworkScores ? JSON.parse(summary.frameworkScores) : {};
    if (Object.keys(frameworks).length) {
      await expect(page.getByRole('heading', { name: 'Framework Scores', exact: true })).toBeVisible();
      for (const [name, value] of Object.entries(frameworks)) {
        const row = page.getByTestId('framework-score').filter({
          has: page.getByTestId('framework-score-name').filter({ hasText: name }),
        });
        await expect(row.getByTestId('framework-score-name')).toHaveText(name);
        await expect(row.getByTestId('framework-score-value')).toHaveText(String(value));
        await expect(row.getByTestId('framework-score-value')).toBeVisible();
      }
    }
    await page.screenshot({ path: test.info().outputPath('step-3.png'), fullPage: true });
  });

  await test.step('At the bottom, "Try again" and "Back to Dashboard" sit side by side on a laptop and stack on a phone', async () => {
    const actions = page.getByTestId('summary-actions');
    const retry = actions.getByRole('button', { name: 'Try again', exact: true });
    const back = actions.getByRole('link', { name: 'Back to Dashboard', exact: true });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await actions.scrollIntoViewIfNeeded();
      await expect(retry).toHaveCount(1);
      await expect(retry).toBeVisible();
      await expect(actions.getByTestId('reattempt')).toHaveText('Try again');
      await expect(back).toBeVisible();
      await expect(back).toHaveAttribute('href', '/dashboard');
      await expect(page.getByRole('link', { name: 'Back to Dashboard', exact: true })).toHaveCount(1);
      await expect(page.getByText('Back to Dashboard', { exact: true })).toHaveCount(1);
      await page.screenshot({ path: test.info().outputPath(viewport.width === 390 ? 'step-4.png' : 'step-4-laptop.png') });
    }
    await back.click();
    await expect(page).toHaveURL('/dashboard');
    await page.goto(summaryUrl);
    await retry.click();
    await expect(page).toHaveURL(`/persona/${persona.id}/chat`, { timeout: 60000 });
    // Finish on the summary so the watched step's final screenshot shows actions.
    await page.goto(summaryUrl);
    await actions.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('step-4.png') });
  });
});
