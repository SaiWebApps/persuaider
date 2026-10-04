import { LLMProviderFactory } from '@/lib/llm';
import { escapeTags } from '@/lib/llm/deal';
import { recordLlmCall, type Meter } from '@/lib/llm/usage';
import type { LLMMessage } from '@/lib/llm/types';
import { checkFeedbackReply, formatFigure, MAX_POINTS, NO_FEEDBACK, type FeedbackFigures, type RunFeedback } from './feedback';
import type { RunResult, RunTurn } from './transcript';
import type { DealOutcome } from '@/lib/scoring/deal';

/**
 * Writes a finished run's feedback for the You-play side, once, when the run ends.
 * The AI writes every point; code checks each one. A failing reply is asked for
 * again in full, up to two more times; after that nothing is saved but empty lists.
 */

const RETRIES = 2;

export interface FeedbackInput {
  scenarioTitle: string;
  learnerSide: string;
  counterpartSide: string;
  result: RunResult;
  turns: RunTurn[];
  deal: DealOutcome | null;
}

export function feedbackFigures(deal: DealOutcome | null): FeedbackFigures[] | null {
  if (!deal || deal.issues.length === 0) return null;
  return deal.issues.map((i) => ({
    issue: i.name,
    target: formatFigure(i.counterpartTarget, i.unit),
    walkAway: formatFigure(i.counterpartReservation, i.unit),
  }));
}

export function buildFeedbackPrompt(input: FeedbackInput, figures: FeedbackFigures[] | null): string {
  const you = `${input.learnerSide} (You play)`;
  const transcript = input.turns
    .map((t) => `<turn speaker="${t.side === 'learner' ? you : input.counterpartSide}">\n${escapeTags(t.content)}\n</turn>`)
    .join('\n');
  const outcome = { deal: 'They reached a deal.', no_deal: 'They did not reach a deal.', unscored: 'The run ended.' }[input.result];

  const figureRules = figures
    ? `The ${input.counterpartSide}'s hidden figures, which ${input.learnerSide} never saw:
${figures.map((f) => `- ${f.issue}: their hidden target ${f.target}; their hidden walk-away ${f.walkAway}`).join('\n')}
${input.deal?.issues
  .map((i) => `- ${i.name}: ${input.learnerSide} wanted it ${i.learnerWants}; agreed: ${i.agreed === null ? 'no agreement' : formatFigure(i.agreed, i.unit)}`)
  .join('\n')}

In every point, outside the quote, name one issue exactly as written above (same letter case), then the word "target" or "walk-away" followed DIRECTLY by that issue's figure exactly as written above (for example: ${figures[0]!.issue} walk-away ${figures[0]!.walkAway}, or target ${figures[0]!.target}). Never put words such as "of" or "at" between the word and the figure. Then say in plain words what the quoted line meant against that figure.
Example point: When you said "I can do that if we sign for two years", you offered a trade instead of a price, which kept the ${figures[0]!.issue} close to their walk-away ${figures[0]!.walkAway}.`
    : `There are no figures for this run. Outside the quote, write no digits, no numbers and no currency or percent signs at all; say in plain words what the quoted line meant for the ${input.counterpartSide}.
Example point: When you said "I understand the timing is hard for you", you showed the other side you had heard their worry, which made them easier to move.`;

  return `You are a negotiation coach writing short feedback for the side marked "${you}" after a practice negotiation in "${input.scenarioTitle}". Write to them as "you". ${outcome}

TRANSCRIPT:
---
${transcript}
---

${figureRules}

Rules for every point:
- Exactly one plain sentence, ending in a full stop, under 40 words. No other full stops, question marks or exclamation marks outside the quote.
- It quotes one turn spoken by "${you}": copy a short stretch of that turn's words exactly, letter for letter, starting and ending on whole words, inside straight double quotes ("..."). Use exactly one pair of double quotes per point and no other double quotes.
- Plain everyday words. Never use these words: score, grade, out of, utility, reservation, BATNA, ZOPA, anchor.

Give 1 to ${MAX_POINTS} points for what went well and 1 to ${MAX_POINTS} points for what could have gone better.
Respond with ONLY this JSON:
{"wentWell": ["<point>", ...], "goneBetter": ["<point>", ...]}`;
}

export async function writeRunFeedback(input: FeedbackInput, meter: Meter): Promise<RunFeedback> {
  const learnerTurns = input.turns.filter((t) => t.side === 'learner').map((t) => t.content);
  if (learnerTurns.length === 0) return NO_FEEDBACK;
  const figures = feedbackFigures(input.deal);
  const messages: LLMMessage[] = [{ role: 'user', content: buildFeedbackPrompt(input, figures) }];
  const chain = LLMProviderFactory.getProviderChain();

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let raw = '';
    try {
      const response = await chain.generateResponse(messages, { temperature: 0.4, maxTokens: 1200 });
      await recordLlmCall(meter, response);
      raw = response.content;
    } catch (error) {
      console.warn('[run-feedback] model call failed', error);
      continue;
    }
    const checked = checkFeedbackReply(raw, learnerTurns, figures);
    if ('feedback' in checked) return checked.feedback;
    console.warn('[run-feedback] reply failed its checks', checked.problems);
    // Ask again for the whole feedback, saying what failed.
    messages.splice(1, messages.length - 1,
      { role: 'assistant', content: raw },
      { role: 'user', content: `That reply failed these checks:\n- ${checked.problems.join('\n- ')}\nWrite the whole feedback again, following every rule. Respond with ONLY the JSON.` }
    );
  }
  return NO_FEEDBACK;
}
