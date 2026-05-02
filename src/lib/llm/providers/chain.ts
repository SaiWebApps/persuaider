/**
 * LLM Provider Chain
 * 
 * Manages multiple LLM providers with automatic retry and fallback behavior.
 * When a provider fails, retries with exponential backoff before falling back
 * to the next provider in the chain.
 */

import type { LLMProvider, LLMMessage, LLMResponse, LLMOptions, FallbackConfig } from '../types';
import { LLMError, LLMErrorType } from '../errors';
import { retryWithBackoff } from '../retry';

/**
 * Event types emitted by the provider chain
 */
export interface ChainEvent {
  type: 'retry' | 'fallback' | 'success' | 'failure';
  provider: string;
  attempt?: number;
  delay?: number;
  error?: LLMError;
}

/**
 * Callback for chain events (for logging/monitoring)
 */
export type ChainEventCallback = (event: ChainEvent) => void;

/**
 * Options for the LLMProviderChain
 */
export interface ChainOptions {
  /** Callback for chain events (retry, fallback, success, failure) */
  onEvent?: ChainEventCallback;
}

/**
 * LLMProviderChain implements fallback behavior across multiple LLM providers.
 * 
 * When a request fails, it will:
 * 1. Retry the current provider with exponential backoff (if error is retryable)
 * 2. If retries are exhausted, fallback to the next provider in the chain
 * 3. Repeat until a provider succeeds or all providers are exhausted
 * 
 * @example
 * ```typescript
 * const chain = new LLMProviderChain(
 *   [openaiProvider, anthropicProvider],
 *   {
 *     providerOrder: ['openai', 'anthropic'],
 *     maxRetries: 3,
 *     initialDelayMs: 1000,
 *     maxDelayMs: 30000,
 *     backoffMultiplier: 2
 *   }
 * );
 * 
 * const response = await chain.generateResponse(messages);
 * console.log(`Response from: ${response.provider}`);
 * ```
 */
export class LLMProviderChain implements LLMProvider {
  public readonly name = 'chain';

  constructor(
    private readonly providers: LLMProvider[],
    private readonly config: FallbackConfig,
    private readonly options?: ChainOptions
  ) {
    if (providers.length === 0) {
      throw new Error('LLMProviderChain requires at least one provider');
    }
  }

  /**
   * Get the list of available providers in the chain
   */
  getProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  /**
   * Emit a chain event to the callback if configured
   */
  private emit(event: ChainEvent): void {
    this.options?.onEvent?.(event);
  }

  /**
   * Generate a response using the provider chain with retry and fallback
   */
  async generateResponse(
    messages: LLMMessage[],
    options?: LLMOptions
  ): Promise<LLMResponse> {
    const errors: LLMError[] = [];

    for (let providerIndex = 0; providerIndex < this.providers.length; providerIndex++) {
      const provider = this.providers[providerIndex];
      const isLastProvider = providerIndex === this.providers.length - 1;

      try {
        // Try the current provider with retry logic
        const response = await retryWithBackoff(
          () => provider.generateResponse(messages, options),
          {
            maxRetries: this.config.maxRetries,
            initialDelayMs: this.config.initialDelayMs,
            maxDelayMs: this.config.maxDelayMs,
            backoffMultiplier: this.config.backoffMultiplier,
            onRetry: (attempt, error, delay) => {
              this.emit({
                type: 'retry',
                provider: provider.name,
                attempt,
                delay,
                error: error instanceof LLMError ? error : undefined,
              });
              console.warn(
                `[LLMProviderChain] Provider ${provider.name} retry attempt ${attempt} ` +
                `after ${delay}ms: ${error.message}`
              );
            },
            isRetryable: (error) => {
              // Check if the error is retryable
              if (error instanceof LLMError) {
                return error.retryable;
              }
              // Default to retryable for unknown errors
              return true;
            },
          }
        );

        // Success! Emit event and return
        this.emit({
          type: 'success',
          provider: provider.name,
        });

        return response;
      } catch (error) {
        // Capture the error
        const llmError = error instanceof LLMError
          ? error
          : new LLMError(
            error instanceof Error ? error.message : 'Unknown error',
            LLMErrorType.UNKNOWN,
            provider.name,
            true,
            error instanceof Error ? error : undefined
          );

        errors.push(llmError);

        // Log the failure
        console.warn(
          `[LLMProviderChain] Provider ${provider.name} exhausted after ` +
          `${this.config.maxRetries} retries: ${llmError.message}`
        );

        // If this is the last provider, we're done
        if (isLastProvider) {
          this.emit({
            type: 'failure',
            provider: provider.name,
            error: llmError,
          });
        } else {
          // Emit fallback event before trying next provider
          this.emit({
            type: 'fallback',
            provider: provider.name,
            error: llmError,
          });

          console.info(
            `[LLMProviderChain] Falling back from ${provider.name} to ` +
            `${this.providers[providerIndex + 1].name}`
          );
        }
      }
    }

    // All providers failed
    const errorMessages = errors.map(e => `${e.provider}: ${e.message}`).join('; ');
    throw new LLMError(
      `All providers failed. Errors: ${errorMessages}`,
      LLMErrorType.SERVICE_UNAVAILABLE,
      this.name,
      false // Not retryable at this level - all options exhausted
    );
  }
}

/**
 * Create a provider chain from configuration
 * 
 * @param providers Map of provider name to provider instance
 * @param config Fallback configuration
 * @param options Chain options (e.g., event callback)
 * @returns Configured LLMProviderChain
 */
export function createProviderChain(
  providers: Map<string, LLMProvider>,
  config: FallbackConfig,
  options?: ChainOptions
): LLMProviderChain {
  const orderedProviders = config.providerOrder
    .map(name => providers.get(name))
    .filter((p): p is LLMProvider => p !== undefined);

  if (orderedProviders.length === 0) {
    throw new Error(
      `No valid providers found. Requested: ${config.providerOrder.join(', ')}. ` +
      `Available: ${Array.from(providers.keys()).join(', ')}`
    );
  }

  return new LLMProviderChain(orderedProviders, config, options);
}
