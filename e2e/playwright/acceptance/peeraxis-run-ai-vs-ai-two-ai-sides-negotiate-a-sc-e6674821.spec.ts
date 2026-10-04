import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

test('two AI sides negotiate a saved scenario while the learner watches', async ({ page }) => {
  test.setTimeout(420000);
  await loginAsDemo(page);

  const title = `E2E AI vs AI lease ${Date.now()}`;
  const maxMessages = 2;
  const greeting = 'Let us discuss the rent.';
  const personaNames = ['Lou the Landlord', 'Robin the Landlord'];
  const created = await page.request.post('/api/scenarios', {
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
      winCondition: { type: 'manual', maxMessages },
      issues: [{
        name: 'Monthly rent',
        unit: 'USD',
        learnerWants: 'lower',
        learner: { target: 1500, reservation: 1700, weight: 100 },
        counterpart: { target: 1900, reservation: 1600, weight: 100 },
      }],
      personas: personaNames.map(name => ({
        name,
        roleType: 'Landlord',
        roleName: 'Landlord',
        description: 'Firm but fair. Discuss the monthly rent with the tenant.',
        initialGreeting: greeting,
      })),
    },
  });
  expect(created.ok()).toBe(true);
  const { scenario } = await created.json();

  // These test IDs are explicitly part of the card's visible UI contract.
  const messages = page.getByTestId('run-message').filter({ visible: true });
  const outcome = page.getByTestId('run-outcome');
  const report = page.getByTestId('see-report');
  let observedTurns = 0;

  const expectSides = async () => {
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByTestId('you-play')).toBeVisible();
    await expect(page.getByTestId('you-play')).toHaveText('You play: Tenant');
    await expect(page.getByTestId('against-side')).toBeVisible();
    await expect(page.getByTestId('against-side')).toHaveText('Against: Landlord · Lou the Landlord');
  };

  const expectTranscript = async (minimumTurns: number) => {
    let transcript: string[] = [];
    // Read the visible transcript as a collection, without locating a turn by
    // position or depending on the markup used for its label and body.
    await expect.poll(async () => {
      transcript = (await messages.allInnerTexts()).map(text =>
        text.split('\n').map(line => line.trim()).filter(Boolean).join(' '));
      return transcript.length >= minimumTurns && transcript.every((text, index) => {
        const label = index % 2 === 0 ? 'Landlord' : 'Tenant (You play)';
        return text.startsWith(label) && text.slice(label.length).trim().length > 0;
      });
    }, { timeout: 60000, message: 'Each visible turn has the alternating side label and a nonempty message' }).toBe(true);

    expect(transcript[0]).toBe(`Landlord ${greeting}`);
    expect(transcript.length).toBeGreaterThanOrEqual(observedTurns);
    // Two learner turns, plus the greeting and at most two counterpart replies.
    expect(transcript.length).toBeLessThanOrEqual(2 * maxMessages + 1);
    observedTurns = transcript.length;
    await expectSides();
  };

  await test.step('On the dashboard, under a scenario, click Run AI vs AI and pick a counterpart by name', async () => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const run = page.getByTestId(`run-ai-vs-ai-${scenario.id}`);
    await expect(run).toBeVisible();
    await expect(run).toHaveText('Run AI vs AI');
    await expect(run).toHaveAccessibleName('Run AI vs AI');
    await run.click();
    await expect(page.getByRole('heading', { name: 'Run AI vs AI', exact: true })).toBeVisible();
    for (const name of personaNames) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Lou the Landlord', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/run/') && url.pathname.slice('/run/'.length).length > 0);
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step('A page titled with the scenario name shows both side names; the opening line appears, then replies arrive one by one, each labelled with the side that said it', async () => {
    await expectSides();
    // The greeting and even several fast replies can arrive during navigation
    // or the previous screenshot. Validate every turn already present rather
    // than requiring the browser to catch each intermediate message count.
    await expectTranscript(2);
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });

  await test.step('The run ends with Deal reached, No deal, or Message limit reached, and a See report button appears', async () => {
    while (!(await outcome.isVisible())) {
      await expect.poll(async () =>
        (await messages.count()) > observedTurns || await outcome.isVisible(),
      { timeout: 60000, message: 'Another AI turn or the final outcome appears within a minute' }).toBe(true);
      await expectTranscript(observedTurns);
    }
    await expectTranscript(observedTurns);
    await expect(outcome).toHaveCount(1);
    await expect(outcome).toBeVisible();
    const result = (await outcome.innerText()).trim();
    expect(['Deal reached', 'No deal', 'Message limit reached']).toContain(result);
    if (result === 'Message limit reached') {
      expect(Math.floor(observedTurns / 2)).toBe(maxMessages);
    }
    // Agreement or an explicit break-off may happen on the last learner turn;
    // neither outcome imposes a transcript parity or a stricter turn limit.
    await expect(report).toBeVisible();
    await expect(report).toHaveText('See report');
    await expect(page.getByRole('button', { name: 'See report', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('step-3.png') });
  });
});
