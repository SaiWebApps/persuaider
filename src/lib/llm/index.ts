import { LLMProviderFactory } from './providers/factory';
import { buildConversationContext } from './prompts';
import type { LLMResponse, LLMOptions } from './types';
import { LLMError, LLMErrorType } from './errors';
import type { ChainOptions } from './providers/chain';
import { recordLlmCall, type Meter } from './usage';

import type { PersonaPromptInput as Persona, ScenarioPromptInput as Scenario } from './prompts';

interface Message {
  role: string;
  content: string;
}

export interface GenerateOptions extends LLMOptions {
  useFallback?: boolean;
  onChainEvent?: ChainOptions['onEvent'];
  /** When present, the call is recorded against this user's daily budget. */
  meter?: Meter;
}

export async function generatePersonaResponse(
  persona: Persona,
  messages: Message[],
  scenario?: Scenario,
  options?: GenerateOptions
): Promise<LLMResponse> {
  const { useFallback = true, onChainEvent, meter, ...llmOptions } = options || {};

  const contextMessages = buildConversationContext(persona, messages, scenario);

  try {
    const response = useFallback
      ? await LLMProviderFactory.getProviderChain(onChainEvent ? { onEvent: onChainEvent } : undefined).generateResponse(contextMessages, llmOptions)
      : await LLMProviderFactory.getProvider('anthropic').generateResponse(contextMessages, llmOptions);
    if (meter) await recordLlmCall(meter, response);
    return response;
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
