/**
 * Unit tests for LLMProviderChain with fallback behavior
 */

import { LLMProviderChain, ChainEvent } from '../providers/chain';
import type { LLMProvider, LLMMessage, LLMResponse, LLMOptions, FallbackConfig } from '../types';
import { LLMError, LLMErrorType } from '../errors';

// Mock timers for faster tests
jest.useFakeTimers();

/**
 * Create a mock LLM provider
 */
function createMockProvider(
  name: string,
  behavior: 'success' | 'fail-once' | 'fail-always' | 'fail-non-retryable',
  response?: LLMResponse
): LLMProvider {
  const defaultResponse: LLMResponse = {
    content: `Response from ${name}`,
    provider: name,
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  };

  let callCount = 0;

  return {
    name,
    generateResponse: jest.fn(async (): Promise<LLMResponse> => {
      callCount++;

      switch (behavior) {
        case 'success':
          return response || defaultResponse;

        case 'fail-once':
          if (callCount === 1) {
            throw new LLMError(
              'Rate limited',
              LLMErrorType.RATE_LIMIT,
              name,
              true
            );
          }
          return response || defaultResponse;

        case 'fail-always':
          throw new LLMError(
            'Service unavailable',
            LLMErrorType.SERVICE_UNAVAILABLE,
            name,
            true
          );

        case 'fail-non-retryable':
          throw new LLMError(
            'Invalid API key',
            LLMErrorType.AUTHENTICATION_ERROR,
            name,
            false
          );
      }
    }),
  };
}

describe('LLMProviderChain', () => {
  const defaultConfig: FallbackConfig = {
    providerOrder: ['primary', 'secondary', 'tertiary'],
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
  };

  const testMessages: LLMMessage[] = [
    { role: 'system', content: 'You are a helpful assistant' },
    { role: 'user', content: 'Hello' },
  ];

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw if no providers are given', () => {
      expect(() => new LLMProviderChain([], defaultConfig)).toThrow(
        'LLMProviderChain requires at least one provider'
      );
    });

    it('should accept a single provider', () => {
      const provider = createMockProvider('single', 'success');
      const chain = new LLMProviderChain([provider], defaultConfig);
      expect(chain.getProviders()).toEqual(['single']);
    });

    it('should accept multiple providers', () => {
      const providers = [
        createMockProvider('a', 'success'),
        createMockProvider('b', 'success'),
        createMockProvider('c', 'success'),
      ];
      const chain = new LLMProviderChain(providers, defaultConfig);
      expect(chain.getProviders()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('generateResponse', () => {
    it('should succeed on first provider without fallback', async () => {
      const primary = createMockProvider('primary', 'success');
      const secondary = createMockProvider('secondary', 'success');
      const chain = new LLMProviderChain([primary, secondary], defaultConfig);

      const resultPromise = chain.generateResponse(testMessages);
      await expect(resultPromise).resolves.toMatchObject({
        content: 'Response from primary',
        provider: 'primary',
      });

      expect(primary.generateResponse).toHaveBeenCalledTimes(1);
      expect(secondary.generateResponse).not.toHaveBeenCalled();
    });

    it('should retry on failure and succeed on same provider', async () => {
      const primary = createMockProvider('primary', 'fail-once');
      const secondary = createMockProvider('secondary', 'success');
      const chain = new LLMProviderChain([primary, secondary], defaultConfig);

      const resultPromise = chain.generateResponse(testMessages);

      // Advance through retry delay (use async version to flush Promise queue)
      await jest.advanceTimersByTimeAsync(500);

      await expect(resultPromise).resolves.toMatchObject({
        content: 'Response from primary',
        provider: 'primary',
      });

      expect(primary.generateResponse).toHaveBeenCalledTimes(2);
      expect(secondary.generateResponse).not.toHaveBeenCalled();
    });

    it('should fallback to secondary after primary exhausts retries', async () => {
      const primary = createMockProvider('primary', 'fail-always');
      const secondary = createMockProvider('secondary', 'success');
      const chain = new LLMProviderChain([primary, secondary], defaultConfig);

      const resultPromise = chain.generateResponse(testMessages);

      // Advance through all retry delays (use async version to flush Promise queue)
      await jest.advanceTimersByTimeAsync(10000);

      await expect(resultPromise).resolves.toMatchObject({
        content: 'Response from secondary',
        provider: 'secondary',
      });

      expect(primary.generateResponse).toHaveBeenCalledTimes(3);
      expect(secondary.generateResponse).toHaveBeenCalledTimes(1);
    });

    it('should immediately fallback on non-retryable error', async () => {
      const primary = createMockProvider('primary', 'fail-non-retryable');
      const secondary = createMockProvider('secondary', 'success');
      const chain = new LLMProviderChain([primary, secondary], defaultConfig);

      const resultPromise = chain.generateResponse(testMessages);

      await expect(resultPromise).resolves.toMatchObject({
        content: 'Response from secondary',
        provider: 'secondary',
      });

      // Only one call because error is not retryable
      expect(primary.generateResponse).toHaveBeenCalledTimes(1);
      expect(secondary.generateResponse).toHaveBeenCalledTimes(1);
    });

    it('should throw after all providers fail', async () => {
      const primary = createMockProvider('primary', 'fail-always');
      const secondary = createMockProvider('secondary', 'fail-always');
      const chain = new LLMProviderChain([primary, secondary], defaultConfig);

      const resultPromise = chain.generateResponse(testMessages);
      // Prevent unhandled rejection warning by adding a no-op catch
      resultPromise.catch(() => {});

      // Advance through all retry delays (use async version to flush Promise queue)
      await jest.advanceTimersByTimeAsync(30000);

      let thrownError: LLMError | undefined;
      try {
        await resultPromise;
      } catch (e) {
        thrownError = e as LLMError;
      }

      expect(thrownError?.message).toContain('All providers failed');
      expect(thrownError?.type).toBe(LLMErrorType.SERVICE_UNAVAILABLE);
      expect(thrownError?.retryable).toBe(false);
    });

    it('should pass options to providers', async () => {
      const primary = createMockProvider('primary', 'success');
      const chain = new LLMProviderChain([primary], defaultConfig);
      const options: LLMOptions = { temperature: 0.5, maxTokens: 100 };

      await chain.generateResponse(testMessages, options);

      expect(primary.generateResponse).toHaveBeenCalledWith(testMessages, options);
    });
  });

  describe('events', () => {
    it('should emit success event on successful response', async () => {
      const events: ChainEvent[] = [];
      const primary = createMockProvider('primary', 'success');
      const chain = new LLMProviderChain([primary], defaultConfig, {
        onEvent: (event) => events.push(event),
      });

      await chain.generateResponse(testMessages);

      expect(events).toContainEqual({
        type: 'success',
        provider: 'primary',
      });
    });

    it('should emit retry event on retryable failure', async () => {
      const events: ChainEvent[] = [];
      const primary = createMockProvider('primary', 'fail-once');
      const chain = new LLMProviderChain([primary], defaultConfig, {
        onEvent: (event) => events.push(event),
      });

      const resultPromise = chain.generateResponse(testMessages);
      await jest.advanceTimersByTimeAsync(500);
      await resultPromise;

      const retryEvents = events.filter(e => e.type === 'retry');
      expect(retryEvents.length).toBeGreaterThan(0);
      expect(retryEvents[0]).toMatchObject({
        type: 'retry',
        provider: 'primary',
        attempt: 1,
      });
    });

    it('should emit fallback event when switching providers', async () => {
      const events: ChainEvent[] = [];
      const primary = createMockProvider('primary', 'fail-always');
      const secondary = createMockProvider('secondary', 'success');
      const chain = new LLMProviderChain([primary, secondary], defaultConfig, {
        onEvent: (event) => events.push(event),
      });

      const resultPromise = chain.generateResponse(testMessages);
      await jest.advanceTimersByTimeAsync(10000);
      await resultPromise;

      const fallbackEvents = events.filter(e => e.type === 'fallback');
      expect(fallbackEvents.length).toBe(1);
      expect(fallbackEvents[0]).toMatchObject({
        type: 'fallback',
        provider: 'primary',
      });
    });

    it('should emit failure event when all providers fail', async () => {
      const events: ChainEvent[] = [];
      const primary = createMockProvider('primary', 'fail-always');
      const chain = new LLMProviderChain([primary], defaultConfig, {
        onEvent: (event) => events.push(event),
      });

      const resultPromise = chain.generateResponse(testMessages);
      // Prevent unhandled rejection warning by adding a no-op catch
      resultPromise.catch(() => {});
      
      await jest.advanceTimersByTimeAsync(10000);

      try {
        await resultPromise;
      } catch {
        // Expected
      }

      const failureEvents = events.filter(e => e.type === 'failure');
      expect(failureEvents.length).toBe(1);
      expect(failureEvents[0]).toMatchObject({
        type: 'failure',
        provider: 'primary',
      });
    });
  });
});
