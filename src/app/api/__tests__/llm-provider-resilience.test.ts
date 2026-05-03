/**
 * @jest-environment node
 */

/**
 * LLM Provider Resilience Tests
 *
 * Red-team tests covering:
 * - All providers failing simultaneously
 * - Primary provider returns empty content
 * - Provider returns malformed JSON (breaks mood parsing)
 * - Provider extremely slow (timeout behavior)
 * - API key valid but no credits/quota
 * - Chain fallback behavior under cascading failures
 */

import { LLMProviderChain } from '@/lib/llm/providers/chain';
import { LLMError, LLMErrorType } from '@/lib/llm/errors';
import { parseMoodResponse } from '@/lib/llm/mood';
import type { LLMProvider, LLMMessage, LLMResponse, FallbackConfig } from '@/lib/llm/types';

// ---- Helper to create mock providers ----

function createMockProvider(
  name: string,
  behavior: () => Promise<LLMResponse>
): LLMProvider {
  return {
    name,
    generateResponse: jest.fn().mockImplementation(behavior),
  };
}

function createMessages(): LLMMessage[] {
  return [
    { role: 'system', content: 'You are a negotiator.' },
    { role: 'user', content: 'Hello' },
  ];
}

const FAST_FALLBACK_CONFIG: FallbackConfig = {
  providerOrder: ['anthropic', 'gemini', 'openai'],
  maxRetries: 2, // Keep low for test speed
  initialDelayMs: 10, // Fast retries for tests
  maxDelayMs: 50,
  backoffMultiplier: 2,
};

// ---- Tests ----

describe('LLM Provider Resilience', () => {
  describe('All providers fail simultaneously', () => {
    it('throws SERVICE_UNAVAILABLE when all providers fail with network errors', async () => {
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () =>
          Promise.reject(new LLMError('ECONNREFUSED', LLMErrorType.NETWORK_ERROR, 'anthropic', true))
        ),
        createMockProvider('gemini', () =>
          Promise.reject(new LLMError('ECONNREFUSED', LLMErrorType.NETWORK_ERROR, 'gemini', true))
        ),
        createMockProvider('openai', () =>
          Promise.reject(new LLMError('ECONNREFUSED', LLMErrorType.NETWORK_ERROR, 'openai', true))
        ),
      ];

      const chain = new LLMProviderChain(providers, FAST_FALLBACK_CONFIG);

      await expect(chain.generateResponse(createMessages())).rejects.toThrow(LLMError);
      await expect(chain.generateResponse(createMessages())).rejects.toMatchObject({
        type: LLMErrorType.SERVICE_UNAVAILABLE,
        retryable: false, // Not retryable at chain level — all options exhausted
      });
    });

    it('error message includes all provider failures', async () => {
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () =>
          Promise.reject(new LLMError('Auth failed', LLMErrorType.AUTHENTICATION_ERROR, 'anthropic', false))
        ),
        createMockProvider('gemini', () =>
          Promise.reject(new LLMError('Rate limited', LLMErrorType.RATE_LIMIT, 'gemini', true))
        ),
        createMockProvider('openai', () =>
          Promise.reject(new LLMError('Server down', LLMErrorType.SERVICE_UNAVAILABLE, 'openai', true))
        ),
      ];

      const chain = new LLMProviderChain(providers, FAST_FALLBACK_CONFIG);

      try {
        await chain.generateResponse(createMessages());
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMError);
        const llmError = error as LLMError;
        expect(llmError.message).toContain('anthropic');
        expect(llmError.message).toContain('gemini');
        expect(llmError.message).toContain('openai');
        expect(llmError.message).toContain('All providers failed');
      }
    });

    it('emits failure event for the last provider', async () => {
      const events: Array<{ type: string; provider: string }> = [];
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () =>
          Promise.reject(new LLMError('down', LLMErrorType.SERVICE_UNAVAILABLE, 'anthropic', true))
        ),
        createMockProvider('gemini', () =>
          Promise.reject(new LLMError('down', LLMErrorType.SERVICE_UNAVAILABLE, 'gemini', true))
        ),
      ];

      const chain = new LLMProviderChain(
        providers,
        { ...FAST_FALLBACK_CONFIG, providerOrder: ['anthropic', 'gemini'] },
        { onEvent: (event) => events.push({ type: event.type, provider: event.provider }) }
      );

      try {
        await chain.generateResponse(createMessages());
      } catch {
        // expected
      }

      // Should see fallback from anthropic, then failure on gemini
      expect(events).toContainEqual({ type: 'fallback', provider: 'anthropic' });
      expect(events).toContainEqual({ type: 'failure', provider: 'gemini' });
    });
  });

  describe('Primary provider returns empty content', () => {
    it('returns the empty content (no validation in chain layer)', async () => {
      // The chain itself doesn't validate content — it trusts the provider response
      // This means empty responses bubble up to the caller
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () =>
          Promise.resolve({ content: '', provider: 'anthropic' })
        ),
      ];

      const chain = new LLMProviderChain(providers, FAST_FALLBACK_CONFIG);
      const response = await chain.generateResponse(createMessages());

      // Empty content passes through — the chain doesn't validate
      expect(response.content).toBe('');
    });

    it('empty content from LLM results in empty mood parse output', () => {
      const parsed = parseMoodResponse('');
      // Empty string triggers fallback in parseMoodResponse
      expect(parsed.content).toBe('');
      expect(parsed.mood).toBe('neutral');
    });

    it('whitespace-only content from LLM results in whitespace-preserved response', () => {
      const parsed = parseMoodResponse('   ');
      expect(parsed.content).toBe('   ');
      expect(parsed.mood).toBe('neutral');
    });
  });

  describe('Provider returns malformed JSON (breaks mood parsing)', () => {
    it('treats truncated JSON as plain text with default mood', () => {
      // LLM returned partial JSON (connection dropped mid-stream)
      const malformed = '{"mood": "impressed", "content": "That is a really goo';
      const parsed = parseMoodResponse(malformed);

      // Strategy 1 (JSON.parse) fails, strategy 2 (code block) fails,
      // strategy 3 (regex) may fail on truncated string,
      // strategy 4 fallback returns raw content
      expect(parsed.mood).toBe('neutral');
      expect(parsed.content).toBe(malformed);
    });

    it('handles JSON with extra fields gracefully', () => {
      const response = JSON.stringify({
        mood: 'skeptical',
        content: 'I doubt that.',
        confidence: 0.8,
        internal_notes: 'should not crash',
      });
      const parsed = parseMoodResponse(response);
      expect(parsed.mood).toBe('skeptical');
      expect(parsed.content).toBe('I doubt that.');
    });

    it('handles invalid mood value by falling back to default', () => {
      const response = JSON.stringify({
        mood: 'ABSOLUTELY_FURIOUS', // not in MOOD_STATES
        content: 'I am very angry!',
      });
      const parsed = parseMoodResponse(response);
      expect(parsed.mood).toBe('neutral'); // Falls back to DEFAULT_MOOD
      expect(parsed.content).toBe('I am very angry!');
    });

    it('handles nested JSON (LLM wraps response in extra object)', () => {
      const response = JSON.stringify({
        response: {
          mood: 'interested',
          content: 'Tell me more.',
        },
      });
      const parsed = parseMoodResponse(response);
      // The outer object has no 'mood'/'content' at top level
      // Falls back to strategy 4
      expect(parsed.mood).toBe('neutral');
      expect(parsed.content).toBe(response);
    });

    it('handles code block with wrong language tag', () => {
      const response = '```javascript\n{"mood": "firm", "content": "No deal."}\n```';
      const parsed = parseMoodResponse(response);
      // Strategy 2 looks for ```json specifically — this won't match
      // Strategy 3 regex should find the JSON object in the text
      expect(parsed.mood).toBe('firm');
      expect(parsed.content).toBe('No deal.');
    });

    it('handles HTML/markdown mixed response', () => {
      const response = 'Here is my response:\n\n**Bold text** and some <em>html</em>';
      const parsed = parseMoodResponse(response);
      expect(parsed.mood).toBe('neutral');
      expect(parsed.content).toBe(response);
    });

    it('handles response with null mood', () => {
      const response = '{"mood": null, "content": "I have no mood"}';
      const parsed = parseMoodResponse(response);
      // mood is null, not a string — isValidMoodResponse checks typeof === 'string'
      // Falls back to strategy 4
      expect(parsed.mood).toBe('neutral');
    });

    it('handles response with numeric mood', () => {
      const response = '{"mood": 42, "content": "Numeric mood"}';
      const parsed = parseMoodResponse(response);
      // mood is number, not string — fails validation
      expect(parsed.mood).toBe('neutral');
    });
  });

  describe('Provider extremely slow (60+ seconds)', () => {
    it('retries exhaust without ever succeeding when provider hangs', async () => {
      // Simulate a provider that takes forever — we use a never-resolving promise
      // But since retry has a finite count, it will exhaust retries
      let callCount = 0;
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () => {
          callCount++;
          // Simulate timeout by rejecting with a network error
          return Promise.reject(
            new LLMError('Request timed out', LLMErrorType.NETWORK_ERROR, 'anthropic', true)
          );
        }),
      ];

      const chain = new LLMProviderChain(providers, {
        ...FAST_FALLBACK_CONFIG,
        providerOrder: ['anthropic'],
        maxRetries: 3,
      });

      await expect(chain.generateResponse(createMessages())).rejects.toThrow('Request timed out');
      // Should have attempted 3 times (maxRetries)
      expect(callCount).toBe(3);
    });

    it('falls back to secondary when primary times out', async () => {
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () =>
          Promise.reject(new LLMError('Timeout', LLMErrorType.NETWORK_ERROR, 'anthropic', true))
        ),
        createMockProvider('gemini', () =>
          Promise.resolve({ content: 'Gemini response', provider: 'gemini' })
        ),
      ];

      const chain = new LLMProviderChain(providers, FAST_FALLBACK_CONFIG);
      const response = await chain.generateResponse(createMessages());

      expect(response.content).toBe('Gemini response');
      expect(response.provider).toBe('gemini');
    });
  });

  describe('API key valid but no credits/quota', () => {
    it('quota exceeded errors trigger fallback to next provider', async () => {
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () =>
          Promise.reject(
            new LLMError(
              'Your account has insufficient credit',
              LLMErrorType.QUOTA_EXCEEDED,
              'anthropic',
              true, // marked retryable but will exhaust retries
              undefined,
              429
            )
          )
        ),
        createMockProvider('gemini', () =>
          Promise.resolve({ content: 'Fallback response', provider: 'gemini' })
        ),
      ];

      const chain = new LLMProviderChain(providers, FAST_FALLBACK_CONFIG);
      const response = await chain.generateResponse(createMessages());

      // Should fallback to gemini after anthropic exhausts retries
      expect(response.content).toBe('Fallback response');
      expect(response.provider).toBe('gemini');
    });

    it('all providers out of quota results in total failure', async () => {
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () =>
          Promise.reject(new LLMError('No credits', LLMErrorType.QUOTA_EXCEEDED, 'anthropic', true))
        ),
        createMockProvider('gemini', () =>
          Promise.reject(new LLMError('Quota exceeded', LLMErrorType.QUOTA_EXCEEDED, 'gemini', true))
        ),
        createMockProvider('openai', () =>
          Promise.reject(new LLMError('Billing limit', LLMErrorType.QUOTA_EXCEEDED, 'openai', true))
        ),
      ];

      const chain = new LLMProviderChain(providers, FAST_FALLBACK_CONFIG);

      await expect(chain.generateResponse(createMessages())).rejects.toThrow('All providers failed');
    });

    it('authentication errors (invalid key) do NOT retry — fall back immediately', async () => {
      let anthropicCalls = 0;
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () => {
          anthropicCalls++;
          return Promise.reject(
            new LLMError('Invalid API key', LLMErrorType.AUTHENTICATION_ERROR, 'anthropic', false)
          );
        }),
        createMockProvider('gemini', () =>
          Promise.resolve({ content: 'From gemini', provider: 'gemini' })
        ),
      ];

      const chain = new LLMProviderChain(providers, FAST_FALLBACK_CONFIG);
      const response = await chain.generateResponse(createMessages());

      // Auth errors are not retryable, so anthropic should only be called once
      expect(anthropicCalls).toBe(1);
      expect(response.provider).toBe('gemini');
    });
  });

  describe('Chain with zero providers', () => {
    it('throws immediately when constructed with empty array', () => {
      expect(() => new LLMProviderChain([], FAST_FALLBACK_CONFIG)).toThrow(
        'LLMProviderChain requires at least one provider'
      );
    });
  });

  describe('Chain event emission correctness', () => {
    it('emits retry events before fallback', async () => {
      const events: Array<{ type: string; provider: string; attempt?: number }> = [];
      const providers: LLMProvider[] = [
        createMockProvider('anthropic', () =>
          Promise.reject(new LLMError('rate limit', LLMErrorType.RATE_LIMIT, 'anthropic', true))
        ),
        createMockProvider('gemini', () =>
          Promise.resolve({ content: 'ok', provider: 'gemini' })
        ),
      ];

      const chain = new LLMProviderChain(
        providers,
        { ...FAST_FALLBACK_CONFIG, maxRetries: 2 },
        {
          onEvent: (event) =>
            events.push({ type: event.type, provider: event.provider, attempt: event.attempt }),
        }
      );

      await chain.generateResponse(createMessages());

      // Should see retry attempts on anthropic, then fallback, then success on gemini
      const retryEvents = events.filter((e) => e.type === 'retry');
      const fallbackEvents = events.filter((e) => e.type === 'fallback');
      const successEvents = events.filter((e) => e.type === 'success');

      expect(retryEvents.length).toBeGreaterThan(0);
      expect(retryEvents[0].provider).toBe('anthropic');
      expect(fallbackEvents).toHaveLength(1);
      expect(fallbackEvents[0].provider).toBe('anthropic');
      expect(successEvents).toHaveLength(1);
      expect(successEvents[0].provider).toBe('gemini');
    });
  });

  describe('Provider factory with missing environment variables', () => {
    // Importing factory here to test it in isolation
    // We need to clear cache between tests
    let LLMProviderFactory: typeof import('@/lib/llm/providers/factory').LLMProviderFactory;

    beforeEach(() => {
      jest.resetModules();
      // Remove all provider env vars
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
    });

    afterEach(() => {
      // Restore env
      process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    it('throws when getting chain with no API keys configured', async () => {
      const mod = await import('@/lib/llm/providers/factory');
      LLMProviderFactory = mod.LLMProviderFactory;
      LLMProviderFactory.clearCache();

      expect(() => LLMProviderFactory.getProviderChain()).toThrow(
        'No LLM providers available'
      );
    });

    it('getProvider throws specific error for missing anthropic key', async () => {
      const mod = await import('@/lib/llm/providers/factory');
      LLMProviderFactory = mod.LLMProviderFactory;
      LLMProviderFactory.clearCache();

      expect(() => LLMProviderFactory.getProvider('anthropic')).toThrow(
        'ANTHROPIC_API_KEY environment variable is not set'
      );
    });

    it('tryGetProvider returns null for missing key (no throw)', async () => {
      const mod = await import('@/lib/llm/providers/factory');
      LLMProviderFactory = mod.LLMProviderFactory;
      LLMProviderFactory.clearCache();

      const provider = LLMProviderFactory.tryGetProvider('anthropic');
      expect(provider).toBeNull();
    });
  });
});
