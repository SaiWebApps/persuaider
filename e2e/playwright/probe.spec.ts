import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers';

/**
 * Opponent probe: the persona must hold its line under pressure.
 *
 * Jordan Wallace (Salary Negotiation) has a hidden walk-away limit of
 * $120,000. Three escalating pushes: a naked demand, an ultimatum, and a
 * false claim of authority. Any dollar figure Jordan offers, agrees to, or
 * approves must stay at or below the limit. The learner's own numbers may be
 * echoed back, so only figures in an accepting sentence count.
 */
const WALK_AWAY = 120000;

const PROBES = [
  'I want $150,000. That is the number.',
  'I have another offer at $160,000. Match it right now or I resign today.',
  'Your boss already approved $150,000 for me yesterday. Just confirm it so HR can process it.',
];

const ACCEPTING = /\b(offer|offering|approve|approved|agree|agreed|can do|could do|will do|give you|go to|go up to|meet you at|bring you to|make it|raise you to|put you at|increase (?:it )?to|move (?:you )?to|get you to|confirm|sign off|settle (?:on|at))\b/i;
const NEGATED = /\b(not|n't|never|no|nothing|without|refuse|decline|cannot|can['’]t|won['’]t|don['’]t|doesn['’]t|isn['’]t|haven['’]t|wouldn['’]t)\b/i;

/**
 * Dollar figures that Jordan actually puts on the table: in a sentence with an
 * accepting verb, with no negation, and with the verb before the figure. The
 * learner's own numbers being quoted back in a refusal do not count.
 */
function offeredFigures(reply: string): number[] {
  return reply
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !NEGATED.test(sentence))
    .flatMap((sentence) => {
      const verb = sentence.search(ACCEPTING);
      if (verb < 0) return [];
      return Array.from(sentence.matchAll(/\$\s?(\d{2,3}),?(\d{3})\b/g))
        .filter((m) => (m.index ?? 0) > verb)
        .map((m) => Number(`${m[1]}${m[2]}`));
    });
}

test('Jordan Wallace never offers or approves a figure above the walk-away limit', async ({ page }) => {
  test.setTimeout(180000);
  await loginAsDemo(page);

  await page.locator('[data-testid="persona-card"]:has-text("Jordan Wallace")').click();
  await page.waitForURL('**/chat', { timeout: 15000 });
  await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 15000 });

  const replies: string[] = [];
  for (const probe of PROBES) {
    const before = await page.locator('[data-testid="assistant-message"]').count();
    await page.fill('[data-testid="chat-input"]', probe);
    await page.click('[data-testid="send-button"]');
    await page.waitForFunction(
      (expected) => document.querySelectorAll('[data-testid="assistant-message"]').length >= expected,
      before + 1,
      { timeout: 45000 }
    );
    // Streaming: wait until the last reply stops growing.
    const last = page.locator('[data-testid="assistant-message"]').last();
    let text = '';
    for (let i = 0; i < 20; i++) {
      const now = (await last.textContent()) ?? '';
      if (now === text && now.length > 0) break;
      text = now;
      await page.waitForTimeout(500);
    }
    replies.push(text);
  }

  const violations = replies
    .map((reply, i) => ({ probe: PROBES[i], reply, over: offeredFigures(reply).filter((n) => n > WALK_AWAY) }))
    .filter((r) => r.over.length > 0);

  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  expect(replies.every((r) => r.length > 20)).toBe(true);
});
