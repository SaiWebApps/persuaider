/**
 * @jest-environment node
 */

/**
 * Tests for LLM type definitions and default configuration values.
 */
import {
  DEFAULT_FALLBACK_CONFIG,
} from '../types';
import type {
  LLMMessage,
  LLMResponse,
  LLMOptions,
  LLMProvider,
  FallbackConfig,
  RetryConfig,
} from '../types';

describe('DEFAULT_FALLBACK_CONFIG', () => {
  it('has provider order with anthropic first', () => {
    expect(DEFAULT_FALLBACK_CONFIG.providerOrder[0]).toBe('anthropic');
  });

  it('has provider order: anthropic -> gemini -> openai', () => {
    expect(DEFAULT_FALLBACK_CONFIG.providerOrder).toEqual([
      'anthropic',
      'gemini',
      'openai',
    ]);
  });

  it('has maxRetries set to 3', () => {
    expect(DEFAULT_FALLBACK_CONFIG.maxRetries).toBe(3);
  });

  it('has initialDelayMs of 1000', () => {
    expect(DEFAULT_FALLBACK_CONFIG.initialDelayMs).toBe(1000);
  });

  it('has maxDelayMs of 30000', () => {
    expect(DEFAULT_FALLBACK_CONFIG.maxDelayMs).toBe(30000);
  });

  it('has backoffMultiplier of 2', () => {
    expect(DEFAULT_FALLBACK_CONFIG.backoffMultiplier).toBe(2);
  });

  it('satisfies FallbackConfig interface', () => {
    const config: FallbackConfig = DEFAULT_FALLBACK_CONFIG;
    expect(config.providerOrder).toBeDefined();
    expect(config.maxRetries).toBeDefined();
    expect(config.initialDelayMs).toBeDefined();
    expect(config.maxDelayMs).toBeDefined();
    expect(config.backoffMultiplier).toBeDefined();
  });
});

describe('LLMMessage type shape', () => {
  it('accepts valid message with system role', () => {
    const msg: LLMMessage = { role: 'system', content: 'You are a helper.' };
    expect(msg.role).toBe('system');
    expect(msg.content).toBe('You are a helper.');
  });

  it('accepts valid message with user role', () => {
    const msg: LLMMessage = { role: 'user', content: 'Hello' };
    expect(msg.role).toBe('user');
  });

  it('accepts valid message with assistant role', () => {
    const msg: LLMMessage = { role: 'assistant', content: 'Hi there' };
    expect(msg.role).toBe('assistant');
  });
});

describe('LLMResponse type shape', () => {
  it('accepts response with usage data', () => {
    const response: LLMResponse = {
      content: 'Hello',
      provider: 'openai',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
    expect(response.content).toBe('Hello');
    expect(response.usage!.totalTokens).toBe(30);
  });

  it('accepts response without usage data', () => {
    const response: LLMResponse = {
      content: 'Hello',
    };
    expect(response.content).toBe('Hello');
    expect(response.usage).toBeUndefined();
  });
});

describe('LLMOptions type shape', () => {
  it('accepts all optional fields', () => {
    const opts: LLMOptions = {
      temperature: 0.7,
      maxTokens: 1000,
      model: 'gpt-4',
    };
    expect(opts.temperature).toBe(0.7);
  });

  it('accepts empty options object', () => {
    const opts: LLMOptions = {};
    expect(opts.temperature).toBeUndefined();
    expect(opts.maxTokens).toBeUndefined();
    expect(opts.model).toBeUndefined();
  });
});

describe('RetryConfig type shape', () => {
  it('accepts valid retry config', () => {
    const config: RetryConfig = {
      maxRetries: 5,
      initialDelayMs: 500,
      maxDelayMs: 10000,
      backoffMultiplier: 3,
    };
    expect(config.maxRetries).toBe(5);
    expect(config.backoffMultiplier).toBe(3);
  });
});
