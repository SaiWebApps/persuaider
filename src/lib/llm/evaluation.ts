import { LLMProviderFactory } from './providers/factory';
import type { LLMFeedback, WinningArgument } from '@/types';

interface EvaluationMessage {
  role: string;
  content: string;
}

interface EvaluationPersona {
  name: string;
  description: string;
  roleType: string;
  characteristics?: string | null;
}

interface EvaluationScenario {
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  evaluationCriteria: string;
}

export interface EvaluationResult {
  overallScore: number;
  winningArguments: WinningArgument[];
  llmFeedback: LLMFeedback;
  frameworkScores: Record<string, number>;
}

const MAX_EVAL_MESSAGES = 30;

export function buildEvaluationPrompt(
  messages: EvaluationMessage[],
  evaluationCriteria: string,
  persona: EvaluationPersona,
  scenario: EvaluationScenario
): string {
  let criteria: { frameworks?: Array<{ name: string; description: string; elements: Array<{ name: string; description: string }> }>; scoringInstructions?: string } = {};
  try {
    criteria = JSON.parse(evaluationCriteria);
  } catch {
    criteria = {};
  }

  const frameworks = criteria.frameworks || [];
  const frameworksList = frameworks
    .map(f => {
      const elements = f.elements.map(e => `    - ${e.name}: ${e.description}`).join('\n');
      return `  - ${f.name}: ${f.description}\n${elements}`;
    })
    .join('\n');

  const transcript = messages
    .map(m => `${m.role === 'user' ? 'TRAINEE' : persona.name}: ${m.content}`)
    .join('\n\n');

  const frameworkScoreKeys = frameworks.map(f => `"${f.name}": <score 0-100>`).join(', ');

  return `You are an expert negotiation coach evaluating a training conversation.

Scenario: ${scenario.title}
${scenario.description}

Trainee's role: ${scenario.userRole}
AI counterpart: ${persona.name} (${persona.roleType})

Evaluation Frameworks:
${frameworksList || '  - General negotiation effectiveness'}

${criteria.scoringInstructions || 'Evaluate the trainee on each framework. A score of 70+ indicates competence; 85+ indicates excellence.'}

TRANSCRIPT:
---
${transcript}
---

Analyze this conversation and respond with ONLY the following JSON (no other text):

\`\`\`json
{
  "overallScore": <number 0-100>,
  "winningArguments": [
    {
      "text": "<quote or paraphrase of the trainee's argument>",
      "framework": "<framework name>",
      "element": "<specific element within the framework>",
      "effectiveness": <number 1-5>
    }
  ],
  "llmFeedback": {
    "whatWentWell": ["<specific positive observation>"],
    "whatToImprove": ["<specific area for improvement>"],
    "specificSuggestions": ["<actionable suggestion>"]
  },
  "frameworkScores": { ${frameworkScoreKeys || '"Overall": <score 0-100>'} }
}
\`\`\`

Include 3-5 winning arguments. Each feedback category should have 2-4 items. Be specific — reference actual things the trainee said.`;
}

export function parseEvaluationResponse(raw: string): EvaluationResult {
  const fallback: EvaluationResult = {
    overallScore: 50,
    winningArguments: [],
    llmFeedback: {
      whatWentWell: ['Engaged in the conversation'],
      whatToImprove: ['Could not fully evaluate the conversation'],
      specificSuggestions: ['Try again with more detailed arguments'],
    },
    frameworkScores: {},
  };

  let parsed: Record<string, unknown> | null = null;

  // Strategy 1: Direct JSON parse
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    // Not pure JSON
  }

  // Strategy 2: Extract from ```json code block
  if (!parsed) {
    const codeBlockMatch = raw.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Invalid JSON in code block
      }
    }
  }

  // Strategy 3: Find JSON object in text
  if (!parsed) {
    const jsonMatch = raw.match(/\{[\s\S]*?"overallScore"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Invalid JSON fragment
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return fallback;
  }

  const overallScore = clamp(toNumber(parsed.overallScore, 50), 0, 100);

  const winningArguments = Array.isArray(parsed.winningArguments)
    ? (parsed.winningArguments as Record<string, unknown>[])
        .filter(a => a && typeof a.text === 'string')
        .map(a => ({
          text: String(a.text),
          framework: String(a.framework || 'General'),
          element: String(a.element || 'Overall'),
          effectiveness: clamp(toNumber(a.effectiveness, 3), 1, 5),
        }))
    : [];

  const rawFeedback = parsed.llmFeedback as Record<string, unknown> | undefined;
  const llmFeedback: LLMFeedback = {
    whatWentWell: toStringArray(rawFeedback?.whatWentWell, fallback.llmFeedback.whatWentWell),
    whatToImprove: toStringArray(rawFeedback?.whatToImprove, fallback.llmFeedback.whatToImprove),
    specificSuggestions: toStringArray(rawFeedback?.specificSuggestions, fallback.llmFeedback.specificSuggestions),
  };

  const rawScores = parsed.frameworkScores as Record<string, unknown> | undefined;
  const frameworkScores: Record<string, number> = {};
  if (rawScores && typeof rawScores === 'object') {
    for (const [key, value] of Object.entries(rawScores)) {
      frameworkScores[key] = clamp(toNumber(value, 50), 0, 100);
    }
  }

  return { overallScore, winningArguments, llmFeedback, frameworkScores };
}

export async function evaluateConversation(
  messages: EvaluationMessage[],
  persona: EvaluationPersona,
  scenario: EvaluationScenario
): Promise<EvaluationResult> {
  const emptyFallback: EvaluationResult = {
    overallScore: 0,
    winningArguments: [],
    llmFeedback: {
      whatWentWell: [],
      whatToImprove: ['No conversation to evaluate'],
      specificSuggestions: ['Try exchanging a few messages before ending the negotiation'],
    },
    frameworkScores: {},
  };

  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) {
    return emptyFallback;
  }

  // Truncate long conversations
  const evalMessages = messages.length > MAX_EVAL_MESSAGES
    ? messages.slice(-MAX_EVAL_MESSAGES)
    : messages;

  try {
    const prompt = buildEvaluationPrompt(
      evalMessages,
      scenario.evaluationCriteria,
      persona,
      scenario
    );

    const chain = LLMProviderFactory.getProviderChain();
    const response = await chain.generateResponse(
      [{ role: 'system' as const, content: prompt }],
      { temperature: 0.3, maxTokens: 2000 }
    );

    return parseEvaluationResponse(response.content);
  } catch (error) {
    console.error('Evaluation failed, returning fallback:', error);
    return {
      overallScore: 50,
      winningArguments: [],
      llmFeedback: {
        whatWentWell: ['Engaged in the conversation'],
        whatToImprove: ['Evaluation could not be fully completed'],
        specificSuggestions: ['Try again for a more detailed assessment'],
      },
      frameworkScores: {},
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

function toStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter(v => typeof v === 'string' && v.length > 0) as string[];
  }
  return fallback;
}
