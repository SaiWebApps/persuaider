import { MOOD_PROMPT_INSTRUCTION } from './mood';

interface Persona {
  name: string;
  description: string;
  roleType: string;
  characteristics?: string | null;
}

interface Scenario {
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  evaluationCriteria: string;
}

export function buildPersonaPrompt(persona: Persona, scenario: Scenario): string {
  let characteristics: { openness?: number; concerns?: string[]; personality?: string[]; roleBehavior?: string } = {};
  if (persona.characteristics) {
    try {
      characteristics = JSON.parse(persona.characteristics);
    } catch {
      characteristics = {};
    }
  }

  const concerns = characteristics.concerns || [];
  const personality = characteristics.personality || [];
  const roleBehavior = characteristics.roleBehavior || '';

  let evaluationCriteria: { frameworks?: Array<{ name: string; description: string; elements: Array<{ name: string; description: string }> }>; scoringInstructions?: string } = {};
  try {
    evaluationCriteria = JSON.parse(scenario.evaluationCriteria);
  } catch {
    evaluationCriteria = {};
  }

  const frameworksList = (evaluationCriteria.frameworks || [])
    .map(f => `- ${f.name}: ${f.description}`)
    .join('\n');

  return `You are ${persona.name}, playing the role of "${persona.roleType}" in a negotiation training scenario.

Scenario: ${scenario.title}
${scenario.description}

Your role: ${scenario.aiRole}
The trainee's role: ${scenario.userRole}

Your Concerns:
${concerns.length > 0 ? concerns.map((c: string) => `- ${c}`).join('\n') : '- General concerns relevant to your role'}

Your Personality Traits:
${personality.length > 0 ? personality.map((p: string) => `- ${p}`).join('\n') : '- Professional and realistic'}

${roleBehavior ? `Role Behavior: ${roleBehavior}` : ''}

The trainee will be evaluated on:
${frameworksList || '- General negotiation effectiveness'}

${evaluationCriteria.scoringInstructions || ''}

Conversation Guidelines:
1. Stay in character throughout — be realistic, not easily swayed
2. Respond naturally based on your personality and concerns
3. Push back on weak arguments, acknowledge strong ones
4. Keep responses concise (2-4 sentences max)
5. Adapt your resistance level based on how well the trainee addresses your concerns

${MOOD_PROMPT_INSTRUCTION}`;
}

export function buildConversationContext(
  persona: Persona,
  messages: Array<{ role: string; content: string }>,
  scenario?: Scenario
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const defaultScenario: Scenario = {
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

  return [
    { role: 'system', content: systemPrompt },
    ...formattedMessages,
  ];
}
