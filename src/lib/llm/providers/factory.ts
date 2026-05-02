import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { LLMProviderChain, ChainOptions } from './chain';
import type { LLMProvider, FallbackConfig } from '../types';
import { DEFAULT_FALLBACK_CONFIG } from '../types';

/**
 * Hardcoded fallback order: Claude (primary) → Gemini (backup) → ChatGPT (final fallback)
 * This is business logic, not environment configuration.
 * The order can only be changed via code review.
 */
const PROVIDER_ORDER = ['anthropic', 'gemini', 'openai'] as const;

export class LLMProviderFactory {
  private static providers: Map<string, LLMProvider> = new Map();
  private static providerChain: LLMProviderChain | null = null;

  /**
   * Get a single provider instance by name
   *
   * @param providerName The name of the provider ('gemini', 'anthropic', 'openai')
   * @returns The provider instance
   * @throws Error if the provider is not configured or API key is missing
   */
  static getProvider(providerName: typeof PROVIDER_ORDER[number]): LLMProvider {
    // Check if provider is already initialized
    if (this.providers.has(providerName)) {
      return this.providers.get(providerName)!;
    }

    // Initialize provider
    let provider: LLMProvider;

    switch (providerName) {
      case 'gemini':
        if (!process.env.GOOGLE_GEMINI_API_KEY) {
          throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set');
        }
        provider = new GeminiProvider(process.env.GOOGLE_GEMINI_API_KEY);
        break;

      case 'anthropic':
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY environment variable is not set');
        }
        provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
        break;

      case 'openai':
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY environment variable is not set');
        }
        provider = new OpenAIProvider(process.env.OPENAI_API_KEY);
        break;

      default:
        throw new Error(`Unknown LLM provider: ${providerName}`);
    }

    // Cache the provider
    this.providers.set(providerName, provider);
    return provider;
  }

  /**
   * Try to get a provider, returning null if not configured
   *
   * @param providerName The name of the provider
   * @returns The provider instance or null if not available
   */
  static tryGetProvider(providerName: typeof PROVIDER_ORDER[number]): LLMProvider | null {
    try {
      return this.getProvider(providerName);
    } catch {
      return null;
    }
  }

  /**
   * Get a provider chain with fallback support
   *
   * This method returns a provider chain that will automatically retry
   * failed requests and fallback to alternative providers when the
   * primary provider is unavailable.
   *
   * Fallback order is hardcoded: Claude → Gemini → ChatGPT
   * Configure only API keys via environment variables.
   *
   * @param options Optional chain options (e.g., event callback for monitoring)
   * @returns A configured LLMProviderChain
   * @throws Error if no providers are available
   *
   * @example
   * ```typescript
   * // Basic usage - uses Gemini → Claude → ChatGPT fallback
   * const chain = LLMProviderFactory.getProviderChain();
   *
   * // With monitoring
   * const chain = LLMProviderFactory.getProviderChain({
   *   onEvent: (event) => console.log('Chain event:', event)
   * });
   * ```
   */
  static getProviderChain(options?: ChainOptions): LLMProviderChain {
    // Get available providers based on the hardcoded order
    const availableProviders: LLMProvider[] = [];
    const unavailableProviders: string[] = [];

    for (const name of PROVIDER_ORDER) {
      const provider = this.tryGetProvider(name);
      if (provider) {
        availableProviders.push(provider);
      } else {
        unavailableProviders.push(name);
      }
    }

    // Log warnings for unavailable providers
    if (unavailableProviders.length > 0) {
      console.warn(
        `[LLMProviderFactory] Some providers not available (missing API keys): ` +
        `${unavailableProviders.join(', ')}`
      );
    }

    // Ensure at least one provider is available
    if (availableProviders.length === 0) {
      throw new Error(
        'No LLM providers available. Configure at least one of: ' +
        'GOOGLE_GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY'
      );
    }

    console.info(
      `[LLMProviderFactory] Initialized provider chain with: ` +
      `${availableProviders.map(p => p.name).join(' -> ')}`
    );

    // Use hardcoded fallback config with the available providers
    const config: FallbackConfig = {
      ...DEFAULT_FALLBACK_CONFIG,
      providerOrder: availableProviders.map(p => p.name),
    };

    return new LLMProviderChain(availableProviders, config, options);
  }

  /**
   * Get a cached provider chain instance
   *
   * This returns a singleton instance of the provider chain,
   * useful for applications that want to reuse the same chain.
   *
   * @param options Optional chain options (only used on first call)
   * @returns The cached LLMProviderChain instance
   */
  static getCachedProviderChain(options?: ChainOptions): LLMProviderChain {
    if (!this.providerChain) {
      this.providerChain = this.getProviderChain(options);
    }
    return this.providerChain;
  }

  /**
   * Clear all cached providers and the provider chain
   */
  static clearCache() {
    this.providers.clear();
    this.providerChain = null;
  }
}
