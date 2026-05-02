import { LLMProviderFactory } from './providers/factory';
import { buildConversationContext } from './prompts';
import type { LLMResponse, LLMOptions } from './types';
import { LLMError, LLMErrorType } from './errors';
import type { ChainOptions } from './providers/chain';

interface Persona {
  name: string;
  description: string;
  roleType: string;
  characteristics?: string | null;
}

interface Scenario {
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  evaluationCriteria: string;
}

interface Message {
  role: string;
  content: string;
}

export interface GenerateOptions extends LLMOptions {
  useFallback?: boolean;
  onChainEvent?: ChainOptions['onEvent'];
}

export async function generatePersonaResponse(
  persona: Persona,
  messages: Message[],
  scenario?: Scenario,
  options?: GenerateOptions
): Promise<LLMResponse> {
  const { useFallback = true, onChainEvent, ...llmOptions } = options || {};

  const contextMessages = buildConversationContext(persona, messages, scenario);

  try {
    if (useFallback) {
      const chain = LLMProviderFactory.getProviderChain(
        onChainEvent ? { onEvent: onChainEvent } : undefined
      );
      return await chain.generateResponse(contextMessages, llmOptions);
    } else {
      const provider = LLMProviderFactory.getProvider('anthropic');
      return await provider.generateResponse(contextMessages, llmOptions);
    }
  } catch (error) {
    if (error instanceof LLMError) {
      throw error;
    }
    console.error('Error generating persona response:', error);
    throw new LLMError(
      error instanceof Error ? error.message : 'Unknown error generating response',
      LLMErrorType.UNKNOWN,
      'unknown',
      false,
      error instanceof Error ? error : undefined
    );
  }
}

export { LLMProviderFactory } from './providers/factory';
export { LLMError, LLMErrorType } from './errors';
export type { LLMMessage, LLMResponse, LLMOptions } from './types';
export type { ChainEvent, ChainOptions } from './providers/chain';
