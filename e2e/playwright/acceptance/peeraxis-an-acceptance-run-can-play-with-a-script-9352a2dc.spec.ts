import { test, expect, type Locator } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

// Read what a person sees, including the line break between side and speech.
// textContent can concatenate those two blocks without any intervening space.
const readTurns = async (turns: Locator) => {
  for (const turn of await turns.all()) await expect(turn).toBeVisible();
  return (await turns.allInnerTexts()).map(text =>
    text.split('\n').map(line => line.trim()).filter(Boolean).join(' '));
};

test('an acceptance run can play with a scripted AI stand-in instead of the real AI', async ({ page }) => {
  test.setTimeout(900000);
  await loginAsDemo(page);

  const title = `E2E Scripted AI lease ${Date.now()}`;
  const greeting = 'Let us discuss the rent.';
  const created = await page.request.post('/api/scenarios', {
    data: {
      title,
      description: 'Negotiate a commercial lease.',
      userRole: 'Tenant', aiRole: 'Landlord', learnerRoleName: 'Tenant',
      roles: [
        { name: 'Tenant', description: 'Keep the lease affordable.' },
        { name: 'Landlord', description: 'Protect the building value.' },
      ],
      winCondition: { type: 'manual', maxMessages: 4 },
      issues: [{
        name: 'Monthly rent', unit: 'USD', learnerWants: 'lower',
        learner: { target: 1500, reservation: 1700, weight: 100 },
        counterpart: { target: 1900, reservation: 1600, weight: 100 },
      }],
      personas: [{
        name: 'Lou the Landlord', roleType: 'Landlord', roleName: 'Landlord',
        description: 'Firm but fair.', initialGreeting: greeting,
      }],
    },
  });
  expect(created.ok()).toBe(true);
  const { scenario } = await created.json();

  const script = {
    turns: [
      'I would like an affordable lease.',
      'I need to protect the building value.',
      'Let us keep discussing the monthly rent.',
    ],
    feedback: {
      wentWell: [
        'Saying "an affordable lease" kept Monthly rent below their target $1,900 in view.',
      ],
      goneBetter: [
        'Saying "keep discussing the monthly rent" left their Monthly rent walk-away $1,600 unexplored.',
      ],
    },
  };
  // Three plain replies also exercise the promised last-line repetition.
  const expectedTranscript = [`Landlord ${greeting}`, ...Array.from({ length: 8 }, (_, index) =>
    `${index % 2 === 0 ? 'Tenant (You play)' : 'Landlord'} ${script.turns[Math.min(index, script.turns.length - 1)]}`)];

  const messages = page.getByTestId('run-message');
  const outcome = page.getByTestId('run-outcome');
  const reportTurns = page.getByTestId('report-turns').getByTestId('run-message');

  const startRun = async () => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const start = page.getByTestId(`run-ai-vs-ai-${scenario.id}`);
    await expect(start).toHaveText('Run AI vs AI');
    await expect(start).toHaveAccessibleName('Run AI vs AI');
    await start.click();
    await expect(page.getByRole('heading', { name: 'Run AI vs AI', exact: true })).toBeVisible();
    const counterpart = page.getByRole('button', { name: 'Lou the Landlord', exact: true });
    await expect(counterpart).toHaveText('Lou the Landlord');
    await counterpart.click();
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
  };

  const openReport = async () => {
    await expect(page.getByTestId('see-report')).toHaveText('See report');
    await page.getByRole('button', { name: 'See report', exact: true }).click();
    await expect(page.getByTestId('report-title')).toHaveText(title);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByTestId('report-turns')).toBeVisible();
  };

  const checkScriptedReport = async () => {
    await expect(page.getByTestId('report-result')).toHaveText('No deal');
    await expect(page.getByRole('heading', { name: 'Turns (9)', exact: true })).toBeVisible();
    await expect(reportTurns).toHaveCount(9);
    expect(await readTurns(reportTurns)).toEqual(expectedTranscript);
    const feedback = page.getByTestId('report-feedback');
    await expect(feedback).toBeVisible();
    await expect(feedback.getByRole('heading', { name: 'What went well', exact: true })).toBeVisible();
    await expect(feedback.getByRole('heading', { name: 'What could have gone better', exact: true })).toBeVisible();
    const well = feedback.getByTestId('report-went-well');
    const better = feedback.getByTestId('report-gone-better');
    for (const list of [well, better]) await expect(list).toBeVisible();
    await expect(well.getByTestId('report-point')).toHaveText(script.feedback.wentWell);
    await expect(better.getByTestId('report-point')).toHaveText(script.feedback.goneBetter);
    await expect(well.getByTestId('report-point').getByTestId('report-point-quote')).toHaveText('an affordable lease');
    await expect(better.getByTestId('report-point').getByTestId('report-point-quote')).toHaveText('keep discussing the monthly rent');
  };

  // The script persists for the entire acceptance run; a fresh browser context
  // is not a reset. Prepare the unscripted control BEFORE the only script POST,
  // then inspect its saved report in watched step 3. No interception or AI patching.
  await startRun();
  let observedCount = await messages.count();
  while (!(await outcome.isVisible())) {
    await expect.poll(async () => await outcome.isVisible() || (await messages.count()) > observedCount,
      { timeout: 60000, message: 'The real AI supplies another turn or the run finishes within a minute' }).toBe(true);
    observedCount = await messages.count();
  }
  const realOutcome = (await outcome.innerText()).trim();
  const realTranscript = await readTurns(messages);
  await openReport();
  const realReportUrl = page.url();

  await test.step('Start an acceptance run that asks for the stand-in with a script of plain replies, on a scenario with a 4-message limit: the run page reaches nine turns and Message limit reached, every turn shows the scripted words, and the report shows the scripted feedback.', async () => {
    const saved = await page.request.post('/api/scripted-ai', { data: script });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toEqual(script);
    await startRun();
    // No artificial pacing and no waits for intermediate turn counts.
    await expect(outcome).toHaveText('Message limit reached', { timeout: 60000 });
    await expect(outcome).toBeVisible();
    await expect(messages).toHaveCount(9);
    expect(await readTurns(messages)).toEqual(expectedTranscript);
    await openReport();
    await checkScriptedReport();
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step('Run the same scripted proof twice: both runs show the same transcript, word for word.', async () => {
    // Start another run without resending the script: its cursor starts over.
    await startRun();
    await expect(outcome).toHaveText('Message limit reached', { timeout: 60000 });
    await expect(outcome).toBeVisible();
    await expect(messages).toHaveCount(9);
    expect(await readTurns(messages)).toEqual(expectedTranscript);
    await openReport();
    await checkScriptedReport();
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });

  await test.step("An acceptance run that does not ask for the stand-in still talks to the real AI, as the project's existing proofs do today.", async () => {
    // As in the existing live proofs, observe replies, labels, outcome and report;
    // the provider's identity cannot be established from UI wording alone.
    expect(['Deal reached', 'No deal', 'Message limit reached']).toContain(realOutcome);
    expect(realTranscript.length).toBeGreaterThan(1);
    expect(realTranscript.length).toBeLessThanOrEqual(9);
    expect(realTranscript[0]).toBe(`Landlord ${greeting}`);
    for (const [index, turn] of realTranscript.entries()) {
      const label = index % 2 === 0 ? 'Landlord ' : 'Tenant (You play) ';
      expect(turn.startsWith(label)).toBe(true);
      expect(turn.slice(label.length).trim().length).toBeGreaterThan(0);
    }
    if (realOutcome === 'Message limit reached') expect(Math.floor(realTranscript.length / 2)).toBe(4);
    await page.goto(realReportUrl);
    await expect(page.getByTestId('report-title')).toHaveText(title);
    await expect(page.getByRole('heading', { name: `Turns (${realTranscript.length})`, exact: true })).toBeVisible();
    await expect(page.getByTestId('report-result')).toBeVisible();
    expect(['Deal reached', 'No deal']).toContain((await page.getByTestId('report-result').innerText()).trim());
    await expect(reportTurns).toHaveCount(realTranscript.length);
    expect(await readTurns(reportTurns)).toEqual(realTranscript);
    await page.screenshot({ path: test.info().outputPath('step-3.png') });
  });
});
