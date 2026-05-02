/**
 * Retry Utility with Exponential Backoff
 * 
 * Provides utilities for retrying operations with configurable
 * exponential backoff and jitter.
 */

import type { RetryConfig } from './types';
import { LLMError } from './errors';

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Add jitter to a delay value to prevent thundering herd
 * @param delay Base delay in milliseconds
 * @param jitterFactor Factor for jitter (0-1), default 0.1 (10%)
 * @returns Delay with random jitter added
 */
export function addJitter(delay: number, jitterFactor: number = 0.1): number {
  const jitter = delay * jitterFactor * Math.random();
  return Math.floor(delay + jitter);
}

/**
 * Calculate the delay for a retry attempt using exponential backoff
 * @param attempt Current attempt number (1-based)
 * @param config Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  // Add jitter
  return addJitter(cappedDelay);
}

/**
 * Callback type for retry events
 */
export type OnRetryCallback = (attempt: number, error: Error, delay: number) => void;

/**
 * Options for the retryWithBackoff function
 */
export interface RetryOptions extends RetryConfig {
  /** Callback invoked before each retry attempt */
  onRetry?: OnRetryCallback;
  /** Function to determine if an error is retryable (defaults to checking LLMError.retryable) */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Default retryable error checker
 */
function defaultIsRetryable(error: Error): boolean {
  if (error instanceof LLMError) {
    return error.retryable;
  }
  // By default, treat unknown errors as retryable
  return true;
}

/**
 * Retry an async operation with exponential backoff
 * 
 * @param operation The async operation to retry
 * @param options Retry configuration and callbacks
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 * 
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => provider.generateResponse(messages),
 *   {
 *     maxRetries: 3,
 *     initialDelayMs: 1000,
 *     maxDelayMs: 30000,
 *     backoffMultiplier: 2,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry attempt ${attempt} after ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { onRetry, isRetryable = defaultIsRetryable, ...config } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const shouldRetry = attempt < config.maxRetries && isRetryable(lastError);

      if (!shouldRetry) {
        // Either we've exhausted retries or the error is not retryable
        throw lastError;
      }

      // Calculate delay for next retry
      const delay = calculateBackoffDelay(attempt, config);

      // Invoke retry callback if provided
      if (onRetry) {
        onRetry(attempt, lastError, delay);
      }

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed with no error');
}

/**
 * Create a retry wrapper with pre-configured options
 * 
 * @param defaultOptions Default retry options
 * @returns A function that retries operations with the default options
 * 
 * @example
 * ```typescript
 * const retry = createRetryWrapper({
 *   maxRetries: 3,
 *   initialDelayMs: 1000,
 *   maxDelayMs: 30000,
 *   backoffMultiplier: 2
 * });
 * 
 * const result = await retry(() => provider.generateResponse(messages));
 * ```
 */
export function createRetryWrapper(defaultOptions: RetryOptions) {
  return async function <T>(
    operation: () => Promise<T>,
    overrideOptions?: Partial<RetryOptions>
  ): Promise<T> {
    const options = { ...defaultOptions, ...overrideOptions };
    return retryWithBackoff(operation, options);
  };
}
