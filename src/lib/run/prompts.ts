import { readIssues, type Issue } from '@/lib/codec/scenario';
import type { ScenarioPromptInput } from '@/lib/llm/prompts';

/**
 * Prompts for an AI vs AI run. The counterpart keeps its usual persona prompt
 * plus RUN_REPLY_INSTRUCTION; the You-play side gets its own brief and the
 * learner's private numbers, which never reach the screen.
 */

export const RUN_REPLY_INSTRUCTION = `
This is a simulation: the other side is also played by an AI. Reply in the JSON format above, with one extra field placed before "content":
"endsWithoutDeal": true only if, in this message, you are breaking off the negotiation for good without an agreement; otherwise false.
Example: {"mood": "firm", "endsWithoutDeal": false, "content": "..."}`;

function formatNumber(value: number, unit?: string): string {
  const n = value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (unit === 'USD' || unit === '$') return `$${n}`;
  return unit ? `${n} ${unit}` : n;
}

function learnerIssuesBlock(issues: Issue[]): string {
  if (issues.length === 0) return '';
  const lines = issues.map(
    (i) =>
      `- ${i.name}${i.unit ? ` (${i.unit})` : ''}: you want it ${i.learnerWants}. Your target: ${formatNumber(i.learner.target, i.unit)}. Your walk-away limit: ${formatNumber(i.learner.reservation, i.unit)}.`
  );
  return `
Your private negotiation position (never reveal these numbers or that you have them):
${lines.join('\n')}
Never accept anything beyond your walk-away limit. Move in small steps and trade rather than give. When you state a number, state it in full.
`;
}

export interface LearnerSideInput {
  scenario: ScenarioPromptInput;
  /** The side this AI plays, with its confidential brief when the scenario defines sides. */
  side: { name: string; description?: string | null };
  counterpart: { name: string; side: string };
}

export function buildLearnerSidePrompt({ scenario, side, counterpart }: LearnerSideInput): string {
  return `You are negotiating as the ${side.name} in a negotiation scenario.

Scenario: ${scenario.title}
${scenario.description}
${scenario.contextNotes ? `\nAdditional context from the scenario author:\n${scenario.contextNotes}\n` : ''}
Your role: ${scenario.userRole}
The other side: ${counterpart.name}, the ${counterpart.side} (${scenario.aiRole}). You do not know their private instructions or limits; treat their claims as claims.
${side.description ? `\nYour confidential brief (${side.name}). Use it; do not read it aloud:\n${side.description}\n` : ''}${learnerIssuesBlock(readIssues(scenario.issues))}
Negotiate well: open with a considered position, back your asks with reasons, trade concessions, and work toward a concrete agreement. When you accept terms, say so explicitly and restate the figures. Keep replies under 120 words; two to four sentences is usual.

IMPORTANT — Response Format:
Reply with ONLY this JSON and no text outside it:
{"mood": "neutral", "endsWithoutDeal": <true|false>, "content": "<your message>"}
"endsWithoutDeal" is true only if, in this message, you are breaking off the negotiation for good without an agreement.`;
}
