export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** The provider that successfully generated this response */
  provider?: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMProvider {
  name: string;
  generateResponse(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  generateStreamingResponse?(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<string, void, unknown>;
}

/**
 * Configuration for LLM provider fallback behavior
 */
export interface FallbackConfig {
  /** Ordered list of provider names to try (e.g., ['openai', 'anthropic']) */
  providerOrder: string[];
  /** Maximum number of retry attempts per provider before falling back */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (e.g., 2 means delay doubles each retry) */
  backoffMultiplier: number;
}

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
}

/**
 * Default configuration values for fallback behavior
 * Order: Claude/Anthropic (primary) → Gemini (backup) → ChatGPT/OpenAI (final fallback)
 */
export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  providerOrder: ['anthropic', 'gemini', 'openai'],
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};
