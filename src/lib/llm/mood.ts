import { MOOD_STATES, DEFAULT_MOOD, type MoodType } from '@/types';

/**
 * Prompt instruction appended to the system prompt to request
 * mood metadata in the LLM response.
 */
export const MOOD_PROMPT_INSTRUCTION = `
IMPORTANT — Response Format:
You MUST wrap your entire response in the following JSON format. Do NOT include any text outside this JSON block:

\`\`\`json
{
  "mood": "<one of: neutral, firm, skeptical, interested, impressed, frustrated, considering>",
  "content": "<your in-character response here>"
}
\`\`\`

The "mood" field reflects your current emotional state in this negotiation:
- "neutral": Baseline composure, factual exchange
- "firm": Resolute, holding your ground
- "skeptical": Doubtful, unconvinced by the argument
- "interested": Engaged, the other party raised a good point
- "impressed": Positively surprised by a strong argument
- "frustrated": Annoyed, the argument is weak or repetitive
- "considering": Thoughtful, weighing the merits of the argument

Choose the mood that best matches how your character would feel given the trainee's latest message.`;

/**
 * Parsed structured response from the LLM.
 */
export interface ParsedLLMResponse {
  content: string;
  mood: MoodType;
}

/**
 * Parse a raw LLM response string to extract mood and content.
 *
 * Strategy:
 * 1. Try to parse the entire response as JSON.
 * 2. Try to extract a JSON code block (```json ... ```).
 * 3. Try to find a JSON object with "mood" and "content" keys anywhere in the text.
 * 4. Fall back to treating the entire response as content with DEFAULT_MOOD.
 */
export function parseMoodResponse(raw: string): ParsedLLMResponse {
  // Strategy 1: Direct JSON parse
  try {
    const parsed = JSON.parse(raw.trim());
    if (isValidMoodResponse(parsed)) {
      return { content: parsed.content, mood: validateMood(parsed.mood) };
    }
  } catch {
    // Not pure JSON, try other strategies
  }

  // Strategy 2: Extract from ```json ... ``` code block
  const codeBlockMatch = raw.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (isValidMoodResponse(parsed)) {
        return { content: parsed.content, mood: validateMood(parsed.mood) };
      }
    } catch {
      // Invalid JSON in code block
    }
  }

  // Strategy 3: Find JSON object in text
  const jsonMatch = raw.match(/\{[\s\S]*?"mood"\s*:\s*"[^"]*?"[\s\S]*?"content"\s*:\s*"[\s\S]*?"\s*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isValidMoodResponse(parsed)) {
        return { content: parsed.content, mood: validateMood(parsed.mood) };
      }
    } catch {
      // Invalid JSON fragment
    }
  }

  // Strategy 4: Fallback — use entire response as content
  return { content: raw, mood: DEFAULT_MOOD };
}

function isValidMoodResponse(obj: unknown): obj is { mood: string; content: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'mood' in obj &&
    'content' in obj &&
    typeof (obj as Record<string, unknown>).mood === 'string' &&
    typeof (obj as Record<string, unknown>).content === 'string'
  );
}

function validateMood(mood: string): MoodType {
  const lower = mood.toLowerCase().trim() as MoodType;
  if ((MOOD_STATES as readonly string[]).includes(lower)) {
    return lower;
  }
  return DEFAULT_MOOD;
}
