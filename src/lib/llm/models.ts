/**
 * Hardcoded LLM model versions
 * 
 * These are pinned to specific versions to ensure:
 * 1. Consistent behavior across all environments
 * 2. Prompts are tested against these specific models
 * 3. Model upgrades go through code review
 * 
 * To upgrade a model:
 * 1. Update the version here
 * 2. Test prompts and response parsing with the new model
 * 3. Deploy through normal release process
 */
export const LLM_MODELS = {
  /** Google Gemini model - backup provider */
  gemini: 'gemini-2.0-flash',

  /** Anthropic Claude model - primary provider */
  anthropic: 'claude-sonnet-4-5-20250929',

  /** OpenAI ChatGPT model - final fallback */
  openai: 'gpt-5.2-instant',
} as const;

export type LLMModelProvider = keyof typeof LLM_MODELS;
