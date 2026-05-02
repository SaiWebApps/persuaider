/**
 * @jest-environment node
 */

/**
 * Tests for LLM model constants.
 */
import { LLM_MODELS } from '../models';
import type { LLMModelProvider } from '../models';

describe('LLM_MODELS', () => {
  it('defines gemini model', () => {
    expect(LLM_MODELS.gemini).toBeDefined();
    expect(typeof LLM_MODELS.gemini).toBe('string');
    expect(LLM_MODELS.gemini.length).toBeGreaterThan(0);
  });

  it('defines anthropic model', () => {
    expect(LLM_MODELS.anthropic).toBeDefined();
    expect(typeof LLM_MODELS.anthropic).toBe('string');
    expect(LLM_MODELS.anthropic.length).toBeGreaterThan(0);
  });

  it('defines openai model', () => {
    expect(LLM_MODELS.openai).toBeDefined();
    expect(typeof LLM_MODELS.openai).toBe('string');
    expect(LLM_MODELS.openai.length).toBeGreaterThan(0);
  });

  it('has exactly three providers', () => {
    const keys = Object.keys(LLM_MODELS);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('gemini');
    expect(keys).toContain('anthropic');
    expect(keys).toContain('openai');
  });

  it('model values are non-empty strings', () => {
    for (const [key, value] of Object.entries(LLM_MODELS)) {
      expect(typeof value).toBe('string');
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it('LLMModelProvider type covers all keys', () => {
    // TypeScript compile-time check, but runtime verification:
    const providers: LLMModelProvider[] = ['gemini', 'anthropic', 'openai'];
    providers.forEach(p => {
      expect(LLM_MODELS[p]).toBeDefined();
    });
  });
});
