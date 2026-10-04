import { test, expect, type Locator } from '@playwright/test';
import { loginAsDemo } from '../helpers';

test.describe.configure({ retries: 0 });

const normalise = (text: string) => text.split(/\s+/).filter(Boolean).join(' ');
const failure = "Feedback couldn't be written for this run.";
const wellHeading = 'What went well';
const betterHeading = 'What could have gone better';
const yourLabel = 'Tenant (You play)';
const words = new Intl.Segmenter('en', { granularity: 'word' });

// Literal words, not substring matches: e.g. "upgrade" does not contain "grade".
function occurrences(text: string, phrase: string): number[] {
  const lower = text.toLowerCase();
  const boundaries = new Set<number>([0, text.length]);
  for (const part of words.segment(text)) {
    boundaries.add(part.index);
    boundaries.add(part.index + part.segment.length);
  }
  const found: number[] = [];
  for (let at = lower.indexOf(phrase); at !== -1; at = lower.indexOf(phrase, at + 1)) {
    if (boundaries.has(at) && boundaries.has(at + phrase.length)) found.push(at);
  }
  return found;
}

// Locate only by the card's IDs/names; compare reading order, never geometry.
async function before(first: Locator, second: Locator) {
  const secondElement = await second.elementHandle();
  expect(secondElement).not.toBeNull();
  expect(await first.evaluate((element, other) =>
    !!(element.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING),
  secondElement)).toBe(true);
}

test('run feedback quotes your side, explains the hidden limits, and stays saved, including Unscored runs', async ({ page }) => {
  test.setTimeout(900000);
  await loginAsDemo(page);

  // Public-API setup follows the reference test. All report observations are UI
  // observations; no AI replies, feedback, or end-run responses are intercepted.
  const openFinishedReport = async (withNumbers: boolean) => {
    const title = `E2E Run feedback ${withNumbers ? 'lease' : 'conversation'} ${Date.now()}`;
    const created = await page.request.post('/api/scenarios', {
      data: {
        title,
        description: withNumbers
          ? 'Negotiate monthly rent for a commercial lease. Seek a practical agreement promptly.'
          : 'Discuss how a tenant and landlord can communicate considerately. There are no numerical terms to negotiate.',
        userRole: 'Tenant', aiRole: 'Landlord', learnerRoleName: 'Tenant',
        roles: [
          { name: 'Tenant', description: 'Seek an affordable lease and considerate communication.' },
          { name: 'Landlord', description: 'Protect the building value and communicate considerately.' },
        ],
        winCondition: { type: 'manual', maxMessages: 2 },
        issues: withNumbers ? [{
          name: 'Monthly rent', unit: 'USD', learnerWants: 'lower',
          learner: { target: 1500, reservation: 1700, weight: 100 },
          counterpart: { target: 1900, reservation: 1600, weight: 100 },
        }] : [],
        personas: [{
          name: 'Lou the Landlord', roleType: 'Landlord', roleName: 'Landlord',
          description: 'Firm but fair, and ready to find common ground.',
          initialGreeting: withNumbers
            ? 'Let us discuss the monthly rent.'
            : 'Let us discuss how to communicate considerately.',
        }],
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
    const seeReport = page.getByRole('button', { name: 'See report', exact: true });
    let count = 0;
    while (!(await seeReport.isVisible())) {
      await expect.poll(async () => await seeReport.isVisible()
        || (await page.getByTestId('run-message').count()) > count,
      { timeout: 60000, message: 'The next AI reply or See report appears' }).toBe(true);
      count = await page.getByTestId('run-message').count();
    }
    await seeReport.click();
    await expect(page.getByTestId('report-title')).toHaveText(title);
    await expect(page.getByTestId('report-result')).toBeVisible();
    return { title, url: page.url() };
  };

  const feedback = page.getByTestId('report-feedback');
  const deal = page.getByTestId('report-deal');
  const turns = page.getByTestId('report-turns');
  const result = page.getByTestId('report-result');
  const well = feedback.getByTestId('report-went-well');
  const better = feedback.getByTestId('report-gone-better');
  const points = feedback.getByTestId('report-point');
  let unavailable = false;

  const readPoints = async () => ({
    well: (await well.getByTestId('report-point').allInnerTexts()).map(normalise),
    better: (await better.getByTestId('report-point').allInnerTexts()).map(normalise),
  });

  const checkLists = async (withNumbers: boolean): Promise<boolean> => {
    // Once the report itself is open, feedback must already be present: do not
    // poll for lists or accept a temporary empty/loading section.
    expect(await feedback.isVisible()).toBe(true);
    const previous = withNumbers ? deal : result;
    await expect(previous).toBeVisible();
    await expect(turns).toBeVisible();
    await before(previous, feedback);
    await before(feedback, turns);
    const feedbackElement = await feedback.elementHandle();
    const gap = await previous.evaluate((element, next) => {
      const range = document.createRange();
      range.setStartAfter(element);
      range.setEndBefore(next!);
      return range.toString();
    }, feedbackElement);
    expect(normalise(gap), 'No introductory heading or text between Deal/result and feedback').toBe('');

    const text = normalise(await feedback.innerText());
    for (const forbidden of ['score', 'grade', 'out of', 'utility', 'reservation', 'batna', 'zopa', 'anchor']) {
      expect(occurrences(text, forbidden), `Feedback must not contain the word(s) ${forbidden}`).toEqual([]);
    }
    expect(text.toLowerCase().includes('/100')).toBe(false);

    if (text.includes(failure)) {
      // The owner's exception replaces the lists, not necessarily the headings.
      expect(await points.count()).toBe(0);
      unavailable = true;
      return false;
    }

    const firstHeading = feedback.getByRole('heading', { name: wellHeading, exact: true });
    const secondHeading = feedback.getByRole('heading', { name: betterHeading, exact: true });
    for (const element of [firstHeading, well, secondHeading, better]) {
      expect(await element.isVisible()).toBe(true);
    }
    expect(text.startsWith(wellHeading)).toBe(true);
    await before(firstHeading, well);
    await before(well, secondHeading);
    await before(secondHeading, better);
    for (const list of [well, better]) {
      const listPoints = list.getByTestId('report-point');
      expect(await listPoints.count()).toBeGreaterThanOrEqual(1);
      expect(await listPoints.count()).toBeLessThanOrEqual(3);
      for (const point of await listPoints.all()) {
        await expect(point).toBeVisible();
        const text = normalise(await point.innerText());
        expect(text.endsWith('.')).toBe(true);
        const quote = normalise(await point.getByTestId('report-point-quote').innerText());
        const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });
        expect([...sentences.segment(text.replace(`"${quote}"`, 'this turn'))].length).toBe(1);
      }
    }
    return true;
  };

  const checkQuotes = async () => {
    const ownTurns: string[] = [];
    for (const turn of await turns.getByTestId('run-message').all()) {
      await expect(turn).toBeVisible();
      const text = normalise(await turn.innerText());
      if (text.startsWith(`${yourLabel} `)) ownTurns.push(text.slice(yourLabel.length + 1));
    }
    expect(ownTurns.length).toBeGreaterThan(0);
    for (const point of await points.all()) {
      const quotePart = point.getByTestId('report-point-quote');
      await expect(quotePart).toBeVisible();
      const quote = normalise(await quotePart.innerText());
      expect(quote.length).toBeGreaterThan(0);
      const text = normalise(await point.innerText());
      expect(text.includes(`"${quote}"`)).toBe(true);
      expect(ownTurns.some(turn => occurrences(turn, quote.toLowerCase()).some(at =>
        turn.slice(at, at + quote.length) === quote)), 'Quote is copied exactly from your side').toBe(true);
      // Quotations can themselves contain full stops or numbers. Sentence and
      // explanation checks concern the author's sentence around the quotation.
      const explanation = text.replace(`"${quote}"`, '');
      expect([...words.segment(explanation)].some(part => part.isWordLike)).toBe(true);
    }
  };

  let savedReport: { title: string; url: string };
  let savedPoints: Awaited<ReturnType<typeof readPoints>>;
  let written = false;

  await test.step("Open a finished run's report; below Deal are two headings, What went well and What could have gone better, with short plain sentences and no scores or jargon above them", async () => {
    savedReport = await openFinishedReport(true);
    expect(['Deal reached', 'No deal']).toContain(await result.innerText());
    written = await checkLists(true);
    savedPoints = await readPoints();
    await page.screenshot({ path: test.info().outputPath('step-1.png') });
  });

  await test.step("Each point contains a quoted line that appears word for word in the run's transcript", async () => {
    if (written) await checkQuotes();
    else expect(normalise(await feedback.innerText()).includes(failure)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('step-2.png') });
  });

  await test.step('Each point says what that line meant against the hidden target or walk-away shown under Deal', async () => {
    // One issue makes the association unambiguous without inventing a row ID.
    await expect(deal.getByTestId('report-deal-issue-name')).toHaveText('Monthly rent');
    const target = deal.getByTestId('report-deal-their-target');
    const walkAway = deal.getByTestId('report-deal-their-walk-away');
    await expect(target).toBeVisible();
    await expect(walkAway).toBeVisible();
    await expect(target).toHaveText('$1,900');
    await expect(walkAway).toHaveText('$1,600');
    if (written) {
      for (const point of await points.all()) {
        const quote = normalise(await point.getByTestId('report-point-quote').innerText());
        const explanation = normalise(await point.innerText()).replace(`"${quote}"`, '');
        expect(explanation.includes('Monthly rent')).toBe(true);
        const references = [
          { word: 'target', figure: await target.innerText() },
          { word: 'walk-away', figure: await walkAway.innerText() },
        ];
        expect(references.some(({ word, figure }) => occurrences(explanation, word).some(at => {
          let after = explanation.slice(at + word.length).trimStart();
          // Permit punctuation: target: $1,900 and walk-away—$1,600 are valid.
          while (after.length && ':;,—–-()'.includes(after[0])) after = after.slice(1).trimStart();
          const exactFigure = normalise(figure);
          if (!after.startsWith(exactFigure)) return false;
          const rest = after.slice(exactFigure.length);
          const digit = (character: string | undefined) => !!character && '0123456789'.includes(character);
          return !digit(rest[0]) && !((rest[0] === ',' || rest[0] === '.') && digit(rest[1]));
        })), 'Explanation names the issue and one of its exact hidden limits').toBe(true);
        const prose = explanation.replaceAll('Monthly rent', '').replaceAll('$1,900', '')
          .replaceAll('$1,600', '').replaceAll('walk-away', '').replaceAll('target', '');
        expect([...words.segment(prose)].some(part => part.isWordLike), 'Explain the quoted turn, not just a limit label').toBe(true);
      }
    } else expect(normalise(await feedback.innerText()).includes(failure)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('step-3.png') });
  });

  await test.step('Reopen the same report later: the points are the same, word for word; on a report that says Unscored the two lists still appear', async () => {
    await page.goto('/dashboard');
    await page.goto(savedReport.url);
    await expect(page.getByTestId('report-title')).toHaveText(savedReport.title);
    expect(await checkLists(true)).toBe(written);
    expect(await readPoints()).toEqual(savedPoints);

    const unscoredReport = await openFinishedReport(false);
    await expect(result).toHaveText('Unscored');
    await expect(deal).toHaveCount(0);
    const unscoredWritten = await checkLists(false);
    if (unscoredWritten) {
      await checkQuotes();
      for (const point of await points.all()) {
        const quote = normalise(await point.getByTestId('report-point-quote').innerText());
        const explanation = normalise(await point.innerText()).replace(`"${quote}"`, '');
        // Digits in a verbatim quotation (e.g. "24 hours") are allowed.
        expect([...explanation].some(character => '0123456789$€£¥%'.includes(character))).toBe(false);
      }
    }
    const unscoredPoints = await readPoints();
    await page.goto('/dashboard');
    await page.goto(unscoredReport.url);
    await expect(page.getByTestId('report-title')).toHaveText(unscoredReport.title);
    await expect(result).toHaveText('Unscored');
    expect(await checkLists(false)).toBe(unscoredWritten);
    expect(await readPoints()).toEqual(unscoredPoints);
    await page.screenshot({ path: test.info().outputPath('step-4.png') });
  });

  // A visible failure cannot establish whether the server really tried the AI
  // three times. Do not pretend it can: permitted AI failure is inconclusive,
  // not a product failure and not a passing acceptance of feedback generation.
  // An implementation that always shows the fallback can never pass this test.
  test.skip(unavailable, 'The allowed AI failure state was checked; feedback acceptance needs a run with written points.');
});
