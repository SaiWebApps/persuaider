import { LLMProviderFactory } from './providers/factory';
import { extractDocumentContentFromBuffer } from '@/lib/documents/extract';
import type { GeneratedScenario, GeneratedPersona, PersonaCharacteristics, EvaluationCriteria, WinCondition, GeneratedRole } from '@/types';

const MAX_TITLE_LENGTH = 200;

/**
 * Builds a system prompt for generating a negotiation scenario from a natural language description.
 */
export function buildGenerationPrompt(description: string): string {
  return `You are an expert negotiation training designer. Your job is to create compelling, realistic negotiation training scenarios that help people practice and improve their persuasion and negotiation skills.

Given this description: "${description}"

Generate a complete negotiation training scenario. Respond with ONLY valid JSON matching this exact structure (no other text before or after):

\`\`\`json
{
  "title": "Short descriptive title",
  "description": "2-3 sentence description of the scenario",
  "userRole": "Brief description of the trainee's role and goals",
  "aiRole": "Brief description of the AI counterpart's role and stance",
  "initialGreeting": "The opening message the AI persona delivers to start the conversation",
  "evaluationCriteria": {
    "frameworks": [
      {
        "name": "Framework Name",
        "description": "What this framework measures",
        "elements": [
          { "name": "Element Name", "description": "What this element evaluates" }
        ],
        "weight": 50
      }
    ],
    "scoringInstructions": "Instructions for scoring the trainee"
  },
  "winCondition": { "type": "manual", "maxMessages": 20 },
  "roles": [
    { "name": "Role Name", "description": "Role description" }
  ],
  "personas": [
    {
      "name": "Persona Name",
      "description": "Character background and motivation",
      "roleType": "Their role in the negotiation",
      "initialGreeting": "Their unique opening line",
      "characteristics": {
        "openness": 0.5,
        "concerns": ["Their main concern"],
        "personality": ["Key trait"],
        "roleBehavior": "How they behave in negotiations"
      }
    }
  ]
}
\`\`\`

Requirements:
- Generate 2-4 diverse personas with distinct personalities and negotiation styles
- Include at least one evaluation framework with 2-4 elements
- Make the scenario realistic and challenging
- Personas should have varied openness levels (0.0 = very resistant to 1.0 = very receptive)
- Each persona should have a distinct personality, concerns, and role behavior
- The initialGreeting should set the scene and tone for the negotiation
- Framework weights should sum to 100 across all frameworks`;
}

/**
 * Builds a system prompt for generating a scenario from extracted document content.
 */
export function buildDocumentGenerationPrompt(extractedText: string): string {
  return `You are an expert negotiation training designer. Your job is to create compelling, realistic negotiation training scenarios based on real-world documents.

You have been given the following document content to use as context for generating a negotiation training scenario:

---DOCUMENT START---
${extractedText}
---DOCUMENT END---

Based on the above document, generate a complete negotiation training scenario that captures the key negotiation dynamics, stakeholders, and challenges described or implied in the document.

Respond with ONLY valid JSON matching this exact structure (no other text before or after):

\`\`\`json
{
  "title": "Short descriptive title",
  "description": "2-3 sentence description of the scenario",
  "userRole": "Brief description of the trainee's role and goals",
  "aiRole": "Brief description of the AI counterpart's role and stance",
  "initialGreeting": "The opening message the AI persona delivers to start the conversation",
  "evaluationCriteria": {
    "frameworks": [
      {
        "name": "Framework Name",
        "description": "What this framework measures",
        "elements": [
          { "name": "Element Name", "description": "What this element evaluates" }
        ],
        "weight": 50
      }
    ],
    "scoringInstructions": "Instructions for scoring the trainee"
  },
  "winCondition": { "type": "manual", "maxMessages": 20 },
  "roles": [
    { "name": "Role Name", "description": "Role description" }
  ],
  "personas": [
    {
      "name": "Persona Name",
      "description": "Character background and motivation",
      "roleType": "Their role in the negotiation",
      "initialGreeting": "Their unique opening line",
      "characteristics": {
        "openness": 0.5,
        "concerns": ["Their main concern"],
        "personality": ["Key trait"],
        "roleBehavior": "How they behave in negotiations"
      }
    }
  ]
}
\`\`\`

Requirements:
- Generate 2-4 diverse personas with distinct personalities and negotiation styles
- Include at least one evaluation framework with 2-4 elements
- Make the scenario realistic and based on the document content
- Personas should have varied openness levels (0.0 = very resistant to 1.0 = very receptive)
- Each persona should have a distinct personality, concerns, and role behavior
- Framework weights should sum to 100 across all frameworks
- If the document describes a specific situation, base the scenario on that situation`;
}

/**
 * Parses a raw LLM response string into a GeneratedScenario.
 * Uses a 3-strategy approach to extract JSON from various response formats.
 * NEVER throws — returns null on any parse failure.
 */
export function parseGenerationResponse(raw: string): GeneratedScenario | null {
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

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

  // Strategy 3: Find JSON object in text (look for title field as anchor)
  if (!parsed) {
    const jsonMatch = raw.match(/\{[\s\S]*?"title"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Invalid JSON fragment
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  // Validate required field: title
  if (typeof parsed.title !== 'string' || parsed.title.trim().length === 0) {
    return null;
  }

  // Build the scenario with validation and defaults
  const title = truncateString(String(parsed.title), MAX_TITLE_LENGTH);
  const description = typeof parsed.description === 'string' ? parsed.description : '';
  const userRole = typeof parsed.userRole === 'string' ? parsed.userRole : '';
  const aiRole = typeof parsed.aiRole === 'string' ? parsed.aiRole : '';
  const initialGreeting = typeof parsed.initialGreeting === 'string' ? parsed.initialGreeting : '';

  const evaluationCriteria = parseEvaluationCriteria(parsed.evaluationCriteria);
  const winCondition = parseWinCondition(parsed.winCondition);
  const roles = parseRoles(parsed.roles);
  const personas = parsePersonas(parsed.personas);

  return {
    title,
    description,
    userRole,
    aiRole,
    initialGreeting,
    evaluationCriteria,
    winCondition,
    roles,
    personas,
  };
}

/**
 * Generates a complete scenario from a natural language description.
 */
export async function generateScenario(description: string): Promise<GeneratedScenario> {
  const prompt = buildGenerationPrompt(description);
  const chain = LLMProviderFactory.getProviderChain();

  const response = await chain.generateResponse(
    // Sent as the user turn: Anthropic requires at least one non-system message,
      // and a system-only call is rejected with a 400.
      [{ role: 'user' as const, content: prompt }],
    { temperature: 0.7, maxTokens: 4000 }
  );

  const scenario = parseGenerationResponse(response.content);
  if (!scenario) {
    throw new Error('Failed to parse LLM response into a valid scenario');
  }

  return scenario;
}

/**
 * Generates a scenario from an uploaded document.
 * Extracts text from the document and feeds it to the LLM for scenario generation.
 */
export async function generateScenarioFromDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<GeneratedScenario> {
  const extracted = await extractDocumentContentFromBuffer(buffer, mimeType, filename);

  let textContent: string;

  if (extracted.type === 'text' && extracted.text) {
    textContent = extracted.text;
  } else if (extracted.type === 'image' && extracted.base64Image) {
    textContent = `[This is an image document: ${filename}. The image has been uploaded but text extraction is not available for image-only documents. Please generate a general negotiation scenario based on the filename and context.]`;
  } else {
    throw new Error('Could not extract text from document');
  }

  if (textContent.trim().length === 0) {
    throw new Error('Could not extract text from document');
  }

  const prompt = buildDocumentGenerationPrompt(textContent);
  const chain = LLMProviderFactory.getProviderChain();

  const response = await chain.generateResponse(
    // Sent as the user turn: Anthropic requires at least one non-system message,
      // and a system-only call is rejected with a 400.
      [{ role: 'user' as const, content: prompt }],
    { temperature: 0.7, maxTokens: 4000 }
  );

  const scenario = parseGenerationResponse(response.content);
  if (!scenario) {
    throw new Error('Failed to parse LLM response into a valid scenario');
  }

  return scenario;
}

// --- Private helpers ---

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength);
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

function parseEvaluationCriteria(raw: unknown): EvaluationCriteria {
  const defaultCriteria: EvaluationCriteria = {
    frameworks: [{
      name: 'General Negotiation',
      description: 'Overall negotiation effectiveness',
      elements: [{ name: 'Persuasion', description: 'Ability to persuade the counterpart' }],
      weight: 100,
    }],
    scoringInstructions: 'Evaluate the trainee on overall negotiation effectiveness. A score of 70+ indicates competence.',
  };

  if (!raw || typeof raw !== 'object') return defaultCriteria;

  const obj = raw as Record<string, unknown>;
  const frameworks = Array.isArray(obj.frameworks)
    ? obj.frameworks
        .filter((f): f is Record<string, unknown> => f !== null && typeof f === 'object')
        .map(f => ({
          name: typeof f.name === 'string' ? f.name : 'Framework',
          description: typeof f.description === 'string' ? f.description : '',
          elements: Array.isArray(f.elements)
            ? (f.elements as Record<string, unknown>[])
                .filter(e => e && typeof e === 'object' && typeof e.name === 'string')
                .map(e => ({
                  name: String(e.name),
                  description: typeof e.description === 'string' ? String(e.description) : '',
                }))
            : [],
          weight: clamp(toNumber(f.weight, 50), 0, 100),
        }))
    : defaultCriteria.frameworks;

  const scoringInstructions = typeof obj.scoringInstructions === 'string'
    ? obj.scoringInstructions
    : defaultCriteria.scoringInstructions;

  return { frameworks, scoringInstructions };
}

function parseWinCondition(raw: unknown): WinCondition {
  const defaultCondition: WinCondition = { type: 'manual', maxMessages: 20 };

  if (!raw || typeof raw !== 'object') return defaultCondition;

  const obj = raw as Record<string, unknown>;
  const type = obj.type === 'score_threshold' ? 'score_threshold' : 'manual';
  const maxMessages = toNumber(obj.maxMessages, 20);
  const threshold = type === 'score_threshold' ? toNumber(obj.threshold, 70) : undefined;

  const result: WinCondition = { type, maxMessages };
  if (threshold !== undefined) {
    result.threshold = threshold;
  }

  return result;
}

function parseRoles(raw: unknown): GeneratedRole[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
    .filter(r => typeof r.name === 'string' && r.name.trim().length > 0)
    .map(r => ({
      name: String(r.name),
      description: typeof r.description === 'string' ? String(r.description) : '',
    }));
}

function parsePersonas(raw: unknown): GeneratedPersona[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((p): p is Record<string, unknown> => p !== null && typeof p === 'object')
    .filter(p => typeof p.name === 'string' && p.name.trim().length > 0)
    .map(p => ({
      name: String(p.name),
      description: typeof p.description === 'string' ? String(p.description) : '',
      roleType: typeof p.roleType === 'string' ? String(p.roleType) : 'Counterpart',
      initialGreeting: typeof p.initialGreeting === 'string' ? String(p.initialGreeting) : '',
      characteristics: parseCharacteristics(p.characteristics),
    }));
}

function parseCharacteristics(raw: unknown): PersonaCharacteristics {
  const defaults: PersonaCharacteristics = {
    openness: 0.5,
    concerns: [],
    personality: [],
    roleBehavior: '',
  };

  if (!raw || typeof raw !== 'object') return defaults;

  const obj = raw as Record<string, unknown>;

  return {
    openness: clamp(toNumber(obj.openness, 0.5), 0.0, 1.0),
    concerns: toStringArray(obj.concerns, []),
    personality: toStringArray(obj.personality, []),
    roleBehavior: typeof obj.roleBehavior === 'string' ? obj.roleBehavior : '',
  };
}
