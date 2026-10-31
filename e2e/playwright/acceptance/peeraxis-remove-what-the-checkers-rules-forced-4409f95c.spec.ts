import { test, expect } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

type Feedback = { wentWell: string[]; goneBetter: string[] };
const opening = 'I can do $1,500';
const later = 'We can discuss repairs tomorrow';
const natural: Feedback = {
  wentWell: ['When you said "I can do $1,500", you opened $400 under the $1,900 they hoped for.'],
  goneBetter: ['Saying "We can discuss repairs tomorrow" left their minimum of $1,600 unexplored.'],
};
const unavailable = "Feedback couldn't be written for this run.";

// Only public APIs prepare the scenario, script and AI-vs-AI run. The browser
// finishes the run and opens See report; no feedback response is intercepted.
test('run feedback accepts natural wording and saves only points that meet the requested checks', async ({ page }) => {
  test.setTimeout(2400000);
  await loginAsDemo(page);

  const createScenario = async (scored: boolean) => {
    const title = scored ? 'E2E Natural feedback lease' : 'E2E Natural feedback conversation';
    const response = await page.request.post('/api/scenarios', { data: {
      title, description: 'Discuss a lease and repairs.',
      userRole: 'Tenant', aiRole: 'Landlord', learnerRoleName: 'Tenant',
      roles: [
        { name: 'Tenant', description: 'Keep the lease affordable.' },
        { name: 'Landlord', description: 'Protect the building value.' },
      ],
      winCondition: { type: 'manual', maxMessages: 2 },
      issues: scored ? [{
        name: 'Monthly rent', unit: 'USD', learnerWants: 'lower',
        learner: { target: 1500, reservation: 1700, weight: 100 },
        counterpart: { target: 1900, reservation: 1600, weight: 100 },
      }] : [],
      personas: [{ name: 'Lou the Landlord', roleType: 'Landlord', roleName: 'Landlord',
        description: 'Firm but fair.', initialGreeting: 'Let us discuss the rent.' }],
    } });
    expect(response.ok()).toBe(true);
    const { scenario } = await response.json();
    const people = await page.request.get(`/api/personas?scenarioId=${scenario.id}`);
    expect(people.ok()).toBe(true);
    const { personas } = await people.json();
    const persona = personas.find((person: { name: string }) => person.name === 'Lou the Landlord');
    expect(persona).toBeTruthy();
    return { title, personaId: persona.id, scored };
  };
  const scored = await createScenario(true);
  const unscored = await createScenario(false);
  const feedback = page.getByTestId('report-feedback');
  const deal = page.getByTestId('report-deal');

  const run = async (scenario: typeof scored, sentences: Feedback) => {
    const script = await page.request.post('/api/scripted-ai', { data: {
      turns: [opening, 'I need time to consider this', later, 'Let us continue tomorrow'],
      feedback: sentences,
    } });
    expect(script.ok()).toBe(true);
    const started = await page.request.post('/api/runs', { data: { personaId: scenario.personaId } });
    expect(started.ok()).toBe(true);
    const { run: startedRun } = await started.json();
    await page.goto(`/run/${startedRun.id}`);
    // Four scripted replies plus completion; allow a minute for each reply.
    const seeReport = page.getByRole('button', { name: 'See report', exact: true });
    await expect(seeReport).toBeVisible({ timeout: 300000 });
    await seeReport.click();
    await expect(page.getByTestId('report-title')).toHaveText(scenario.title);
    await expect(page.getByRole('heading', { name: scenario.title, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByTestId('report-result')).toHaveText(scenario.scored ? 'No deal' : 'Unscored');
    await expect(feedback).toBeVisible();
  };

  const show = async (sentences: Feedback) => {
    for (const [key, id, heading] of [
      ['wentWell', 'report-went-well', 'What went well'],
      ['goneBetter', 'report-gone-better', 'What could have gone better'],
    ] as const) {
      await expect(feedback.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      const points = feedback.getByTestId(id).getByTestId('report-point');
      // Compare the supplied words, without imposing point order or list length rules.
      expect((await points.allInnerTexts()).sort()).toEqual([...sentences[key]].sort());
      for (const point of await points.all()) {
        await expect(point).toBeVisible();
        const text = await point.innerText();
        const parts = text.split('"');
        expect(parts.length).toBe(3);
        await expect(point.getByTestId('report-point-quote')).toHaveText(parts[1]);
        await expect(point.getByTestId('report-point-quote')).toBeVisible();
      }
    }
  };
  const rejected = async () => {
    await expect(feedback).toHaveText(unavailable);
    await expect(feedback.getByTestId('report-point')).toHaveCount(0);
  };

  await test.step('Finish an AI-vs-AI run and open its report: under What went well and What could have gone better, each point quotes one of your turns word for word', async () => {
    await run(scored, natural);
    await show(natural);
    const turns = page.getByTestId('report-turns').getByTestId('run-message');
    for (const words of [opening, later]) {
      const turn = turns.filter({ hasText: words });
      await expect(turn).toBeVisible();
      expect((await turn.innerText()).split(/\s+/).join(' ').trim()).toBe(`Tenant (You play) ${words}`);
    }
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step('Each point names a figure shown under Deal, beside Their hidden target or Their hidden walk-away', async () => {
    await expect(deal.getByRole('heading', { name: 'Deal', exact: true })).toBeVisible();
    await expect(deal.getByText('Their hidden target', { exact: true })).toBeVisible();
    await expect(deal.getByText('Their hidden walk-away', { exact: true })).toBeVisible();
    const target = deal.getByTestId('report-deal-their-target');
    const walkAway = deal.getByTestId('report-deal-their-walk-away');
    await expect(target).toBeVisible();
    await expect(target).toHaveText('$1,900');
    await expect(walkAway).toBeVisible();
    await expect(walkAway).toHaveText('$1,600');
    const figures = [await target.innerText(), await walkAway.innerText()];
    for (const point of await feedback.getByTestId('report-point').all()) {
      const [before, , after] = (await point.innerText()).split('"');
      expect(figures.some(figure => `${before} ${after}`.includes(figure))).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });

  await test.step('A point written in its own words, such as: When you said "I can do $1,500", you opened $400 under the $1,900 they hoped for. passes the check made before a point is saved; a point whose quote is not word for word, that names no figure shown under Deal, or that uses a score or jargon word still fails it', async () => {
    await show(natural);
    // Sentence shape is an instruction to the AI, not a reason to discard feedback.
    const freeShape: Feedback = {
      wentWell: ['You said "I can do $1,500". They hoped for $1,900'],
      goneBetter: [`After "We can discuss repairs tomorrow", their $1,600 minimum still mattered because ${'the timing of repairs mattered to both sides and needed more discussion; '.repeat(7)}you could have asked about it`],
    };
    await run(scored, freeShape);
    await show(freeShape);

    const invalid = [
      'When you said "I could do $1,500", they hoped for $1,900.', // changed words
      'When you said "i can do $1,500", they hoped for $1,900.', // changed case
      'When you said "can discuss repair", they hoped for $1,900.', // part of a word
      'When you said "I need time to consider this", they hoped for $1,900.', // their side
      'You said I can do $1,500, below their $1,900 hope.', // no quote
      'You said "I can do $1,500" and "We can discuss repairs tomorrow", below their $1,900 hope.',
      'When you said "I can do $1,500", you made a clear opening.', // missing hidden figure
      'When you said "I can do $1,500", their hope was $1900.', // not the printed figure
      'When you said "I can do $1,500", your own $1,700 limit mattered.', // learner figure
      ...['score', 'graded', 'out of', 'utilities', 'reservation', 'BATNA', 'ZOPA', 'anchoring', '80/100'].map(
        word => `When you said "I can do $1,500", their $1,900 hope informed ${word}.`),
    ];
    for (const [index, sentence] of invalid.entries()) {
      // A failing point in either list must discard even valid sibling points.
      const sentences = { wentWell: [...natural.wentWell], goneBetter: [...natural.goneBetter] };
      sentences[index % 2 === 0 ? 'wentWell' : 'goneBetter'].push(sentence);
      await run(scored, sentences);
      await rejected();
    }

    const unscoredPoints: Feedback = {
      wentWell: ['When you said "I can do $1,500", you left $400 of room for discussion.'],
      goneBetter: ['Saying "We can discuss repairs tomorrow" could have led to a clearer question.'],
    };
    await run(unscored, unscoredPoints);
    await expect(deal).toHaveCount(0);
    await show(unscoredPoints);
    for (const sentence of [
      'When you said "I could do $1,500", you left room for discussion.',
      'When you said "I can do $1,500", your score improved.',
    ]) {
      await run(unscored, { wentWell: unscoredPoints.wentWell, goneBetter: [sentence] });
      await rejected();
    }
    await page.screenshot({ path: test.info().outputPath('step-3.png') });
  });
});
