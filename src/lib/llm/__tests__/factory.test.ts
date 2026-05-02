/**
 * @jest-environment node
 */

import { DEFAULT_FALLBACK_CONFIG } from '../types';

// We need to mock the SDK constructors since they validate API keys
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({}));
});
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({}),
  })),
}));
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({}));
});

describe('LLMProviderFactory', () => {
  beforeEach(() => {
    // Clear module cache so factory re-initializes
    jest.resetModules();
    // Clear env vars
    delete process.env.GOOGLE_GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    delete process.env.GOOGLE_GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it('creates provider chain with anthropic first when all keys present', () => {
    process.env.GOOGLE_GEMINI_API_KEY = 'test-gemini-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const { LLMProviderFactory } = require('../providers/factory');
    LLMProviderFactory.clearCache();
    const chain = LLMProviderFactory.getProviderChain();
    const providers = chain.getProviders();

    expect(providers[0]).toBe('anthropic');
    expect(providers[1]).toBe('gemini');
    expect(providers[2]).toBe('openai');
  });

  it('initializes with only available providers', () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const { LLMProviderFactory } = require('../providers/factory');
    LLMProviderFactory.clearCache();
    const chain = LLMProviderFactory.getProviderChain();
    const providers = chain.getProviders();

    expect(providers).toEqual(['anthropic']);
  });

  it('throws when no API keys are set', () => {
    const { LLMProviderFactory } = require('../providers/factory');
    LLMProviderFactory.clearCache();

    expect(() => LLMProviderFactory.getProviderChain()).toThrow(
      'No LLM providers available'
    );
  });
});

describe('DEFAULT_FALLBACK_CONFIG', () => {
  it('has anthropic as the first provider', () => {
    expect(DEFAULT_FALLBACK_CONFIG.providerOrder[0]).toBe('anthropic');
  });

  it('has gemini as second and openai as third', () => {
    expect(DEFAULT_FALLBACK_CONFIG.providerOrder).toEqual([
      'anthropic',
      'gemini',
      'openai',
    ]);
  });
});
