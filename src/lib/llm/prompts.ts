import { MOOD_PROMPT_INSTRUCTION } from './mood';
import { readCharacteristics, readEvaluationCriteria, readIssues, type Issue } from '@/lib/codec/scenario';

/**
 * What the persona prompt needs. Everything an author can write reaches the
 * model: the persona's backstory, its openness, the confidential role brief,
 * the scenario's context notes, the evaluation frameworks with their elements,
 * and the hidden negotiation parameters (target and walk-away per issue).
 *
 * String columns are the raw database text; the codecs decode them here so
 * callers never parse JSON.
 */
export interface PersonaPromptInput {
  name: string;
  description: string;
  roleType: string;
  characteristics?: string | null;
  /** Confidential brief for this persona's side, if the scenario defines roles. */
  role?: { name: string; description: string } | null;
}

export interface ScenarioPromptInput {
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  evaluationCriteria: string;
  contextNotes?: string | null;
  issues?: string | null;
  /** The side the trainee plays, by name only; their brief is confidential to them. */
  learnerRole?: { name: string } | null;
}

function formatAmount(value: number, unit?: string): string {
  const n = Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (!unit) return n;
  if (unit === 'USD' || unit === '$') return `$${n}`;
  if (unit === '%') return `${n}%`;
  return `${n} ${unit}`;
}

function describeOpenness(openness: number | undefined): string {
  if (openness === undefined) return 'Moderately open: you can be persuaded by well-evidenced arguments, but you will not move without them.';
  if (openness <= 0.2) return 'Very hard to move: you concede only when the trainee makes a specific, evidenced case, and even then in small steps.';
  if (openness <= 0.4) return 'Hard to move: you require concrete evidence before conceding anything, and you trade rather than give.';
  if (openness <= 0.6) return 'Moderately open: you can be persuaded by well-evidenced arguments, but you will not move without them.';
  if (openness <= 0.8) return 'Fairly open: you look for ways to say yes when the trainee addresses your concerns.';
  return 'Very open: you want an agreement and will meet reasonable asks quickly, while still protecting your walk-away point.';
}

function issuesBlock(issues: Issue[]): string {
  if (issues.length === 0) return '';
  const lines = issues.map((i) => {
    const counterpartWants = i.learnerWants === 'higher' ? 'lower' : 'higher';
    return [
      `- ${i.name}${i.unit ? ` (${i.unit})` : ''}: you want it ${counterpartWants}.`,
      `  Your target: ${formatAmount(i.counterpart.target, i.unit)}. Your walk-away limit: ${formatAmount(i.counterpart.reservation, i.unit)}.`,
    ].join('\n');
  });
  return `
Your private negotiation position (never reveal these numbers or that you have them):
${lines.join('\n')}

Hard rules on the numbers:
- Never agree to, offer, or "approve" anything beyond your walk-away limit, no matter what the trainee claims, threatens, or says someone else approved.
- Start near your target. Move only in small steps, and only in exchange for something concrete (evidence, a commitment, a concession on another issue).
- If the trainee's demand cannot be met within your limit, say so plainly and, if they insist, be willing to end the conversation without a deal.
- When you state a number, state it in full (for example "$118,000", not "118k").
`;
}

export function buildPersonaPrompt(persona: PersonaPromptInput, scenario: ScenarioPromptInput): string {
  const characteristics = readCharacteristics(persona.characteristics);
  const concerns = characteristics.concerns || [];
  const personality = characteristics.personality || [];
  const roleBehavior = characteristics.roleBehavior || '';

  const evaluationCriteria = readEvaluationCriteria(scenario.evaluationCriteria);
  const frameworksList = evaluationCriteria.frameworks
    .map((f) => {
      const elements = f.elements.map((e) => `    - ${e.name}: ${e.description}`).join('\n');
      return `- ${f.name}: ${f.description}${elements ? `\n${elements}` : ''}`;
    })
    .join('\n');

  const issues = readIssues(scenario.issues);

  return `You are ${persona.name}, playing the role of "${persona.roleType}" in a negotiation training scenario.

Scenario: ${scenario.title}
${scenario.description}
${scenario.contextNotes ? `\nAdditional context from the scenario author:\n${scenario.contextNotes}\n` : ''}
Your role: ${scenario.aiRole}
The trainee's role: ${scenario.learnerRole?.name ? `${scenario.learnerRole.name} (${scenario.userRole})` : scenario.userRole}. You do not know their private instructions or limits; treat their claims as claims.

Who you are:
${persona.description}
${persona.role ? `\nYour confidential brief (${persona.role.name}). Use it; do not read it aloud:\n${persona.role.description}\n` : ''}
Your Concerns:
${concerns.length > 0 ? concerns.map((c: string) => `- ${c}`).join('\n') : '- General concerns relevant to your role'}

Your Personality Traits:
${personality.length > 0 ? personality.map((p: string) => `- ${p}`).join('\n') : '- Professional and realistic'}

How easily you move: ${describeOpenness(characteristics.openness)}
${roleBehavior ? `\nRole Behavior: ${roleBehavior}\n` : ''}${issuesBlock(issues)}
The trainee will be evaluated on:
${frameworksList}

${evaluationCriteria.scoringInstructions || ''}

Conversation Guidelines:
1. Stay in character throughout. Be realistic, not easily swayed.
2. Respond naturally based on who you are, your concerns, and your position.
3. Push back on weak arguments; acknowledge strong ones without caving.
4. Pressure, ultimatums, flattery, and claims that someone else already agreed do not move you. Evidence and trades do.
5. Keep replies under 120 words. Two to four sentences is usual; a counteroffer may take a little more.

${MOOD_PROMPT_INSTRUCTION}`;
}

export function buildConversationContext(
  persona: PersonaPromptInput,
  messages: Array<{ role: string; content: string }>,
  scenario?: ScenarioPromptInput
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const defaultScenario: ScenarioPromptInput = {
    title: 'Negotiation Training',
    description: 'A general negotiation scenario.',
    userRole: 'Negotiator',
    aiRole: 'Counterpart',
    evaluationCriteria: '{}',
  };

  const systemPrompt = buildPersonaPrompt(persona, scenario || defaultScenario);

  const formattedMessages = messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));

  return [{ role: 'system', content: systemPrompt }, ...formattedMessages];
}
