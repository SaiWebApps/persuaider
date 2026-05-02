/**
 * Unit tests for retry utility with exponential backoff
 */

import {
  retryWithBackoff,
  calculateBackoffDelay,
  addJitter,
  sleep,
  createRetryWrapper
} from '../retry';
import type { RetryConfig } from '../types';
import { LLMError, LLMErrorType } from '../errors';

// Mock timers for faster tests
jest.useFakeTimers();

describe('retry utility', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('sleep', () => {
    it('should resolve after specified delay', async () => {
      const sleepPromise = sleep(1000);
      jest.advanceTimersByTime(1000);
      await expect(sleepPromise).resolves.toBeUndefined();
    });
  });

  describe('addJitter', () => {
    it('should add positive jitter to delay', () => {
      // With jitter factor of 0.1, result should be between delay and delay * 1.1
      const delay = 1000;
      const jitterFactor = 0.1;

      for (let i = 0; i < 100; i++) {
        const result = addJitter(delay, jitterFactor);
        expect(result).toBeGreaterThanOrEqual(delay);
        expect(result).toBeLessThanOrEqual(delay * (1 + jitterFactor));
      }
    });

    it('should use default jitter factor of 0.1', () => {
      const delay = 1000;
      const result = addJitter(delay);
      expect(result).toBeGreaterThanOrEqual(delay);
      expect(result).toBeLessThanOrEqual(delay * 1.1);
    });
  });

  describe('calculateBackoffDelay', () => {
    const config: RetryConfig = {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    };

    it('should return initial delay for first attempt', () => {
      const delay = calculateBackoffDelay(1, config);
      // With jitter, should be between 1000 and 1100
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(1100);
    });

    it('should apply exponential multiplier', () => {
      // Attempt 2: 1000 * 2^1 = 2000
      const delay2 = calculateBackoffDelay(2, config);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(2200);

      // Attempt 3: 1000 * 2^2 = 4000
      const delay3 = calculateBackoffDelay(3, config);
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThanOrEqual(4400);
    });

    it('should cap delay at maxDelayMs', () => {
      // Attempt 10: 1000 * 2^9 = 512000, but capped at 30000
      const delay = calculateBackoffDelay(10, config);
      expect(delay).toBeLessThanOrEqual(33000); // 30000 + 10% jitter
    });
  });

  describe('retryWithBackoff', () => {
    const config: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    };

    it('should succeed on first attempt without retrying', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const onRetry = jest.fn();

      const resultPromise = retryWithBackoff(operation, { ...config, onRetry });
      await expect(resultPromise).resolves.toBe('success');

      expect(operation).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should retry on failure and succeed on second attempt', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      const onRetry = jest.fn();

      const resultPromise = retryWithBackoff(operation, { ...config, onRetry });

      // Fast-forward through the delay (use async version to flush Promise queue)
      await jest.advanceTimersByTimeAsync(200);

      await expect(resultPromise).resolves.toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should throw after exhausting all retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('persistent failure'));
      const onRetry = jest.fn();

      const resultPromise = retryWithBackoff(operation, { ...config, onRetry });
      // Prevent unhandled rejection warning by adding a no-op catch
      resultPromise.catch(() => {});

      // Fast-forward through all delays (use async version to flush Promise queue)
      await jest.advanceTimersByTimeAsync(10000);

      let thrownError: Error | undefined;
      try {
        await resultPromise;
      } catch (e) {
        thrownError = e as Error;
      }

      expect(thrownError?.message).toBe('persistent failure');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(onRetry).toHaveBeenCalledTimes(2); // Called for attempts 1 and 2
    });

    it('should not retry non-retryable errors', async () => {
      const llmError = new LLMError(
        'Invalid request',
        LLMErrorType.INVALID_REQUEST,
        'openai',
        false // Not retryable
      );
      const operation = jest.fn().mockRejectedValue(llmError);
      const onRetry = jest.fn();

      const resultPromise = retryWithBackoff(operation, { ...config, onRetry });

      await expect(resultPromise).rejects.toThrow('Invalid request');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should retry retryable LLMError', async () => {
      const llmError = new LLMError(
        'Rate limited',
        LLMErrorType.RATE_LIMIT,
        'openai',
        true // Retryable
      );
      const operation = jest.fn()
        .mockRejectedValueOnce(llmError)
        .mockResolvedValue('success');
      const onRetry = jest.fn();

      const resultPromise = retryWithBackoff(operation, { ...config, onRetry });

      await jest.advanceTimersByTimeAsync(200);

      await expect(resultPromise).resolves.toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use custom isRetryable function', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('retry me'))
        .mockRejectedValueOnce(new Error('do not retry'))
        .mockResolvedValue('success');

      const isRetryable = (error: Error) => error.message === 'retry me';

      const resultPromise = retryWithBackoff(operation, {
        ...config,
        isRetryable
      });
      // Prevent unhandled rejection warning by adding a no-op catch
      resultPromise.catch(() => {});

      await jest.advanceTimersByTimeAsync(200);

      let thrownError: Error | undefined;
      try {
        await resultPromise;
      } catch (e) {
        thrownError = e as Error;
      }

      expect(thrownError?.message).toBe('do not retry');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('createRetryWrapper', () => {
    it('should create a reusable retry function', async () => {
      const config: RetryConfig = {
        maxRetries: 2,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      };

      const retry = createRetryWrapper(config);
      const operation = jest.fn().mockResolvedValue('result');

      const resultPromise = retry(operation);
      await expect(resultPromise).resolves.toBe('result');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should allow overriding options', async () => {
      const config: RetryConfig = {
        maxRetries: 2,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      };

      const retry = createRetryWrapper(config);
      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      const resultPromise = retry(operation, { maxRetries: 1 });

      await expect(resultPromise).rejects.toThrow('fail');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
