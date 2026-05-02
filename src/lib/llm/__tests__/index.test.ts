/**
 * @jest-environment node
 */

const mockGetProvider = jest.fn();
const mockGetProviderChain = jest.fn();

jest.mock('../providers/factory', () => ({
  LLMProviderFactory: {
    getProvider: (...args: unknown[]) => mockGetProvider(...args),
    getProviderChain: (...args: unknown[]) => mockGetProviderChain(...args),
  },
}));

jest.mock('../prompts', () => ({
  buildConversationContext: jest.fn().mockReturnValue([
    { role: 'system', content: 'test prompt' },
    { role: 'user', content: 'hello' },
  ]),
}));

import { generatePersonaResponse } from '../index';

const mockPersona = {
  name: 'Test',
  description: 'A test persona',
  roleType: 'Tester',
  characteristics: null,
};

const mockMessages = [{ role: 'user', content: 'hello' }];

describe('generatePersonaResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the provider chain by default', async () => {
    const mockChain = {
      generateResponse: jest.fn().mockResolvedValue({
        content: 'response',
        provider: 'anthropic',
      }),
    };
    mockGetProviderChain.mockReturnValue(mockChain);

    await generatePersonaResponse(mockPersona, mockMessages);

    expect(mockGetProviderChain).toHaveBeenCalled();
    expect(mockChain.generateResponse).toHaveBeenCalled();
  });

  it('uses anthropic directly when useFallback is false', async () => {
    const mockProvider = {
      generateResponse: jest.fn().mockResolvedValue({
        content: 'response',
        provider: 'anthropic',
      }),
    };
    mockGetProvider.mockReturnValue(mockProvider);

    await generatePersonaResponse(mockPersona, mockMessages, undefined, {
      useFallback: false,
    });

    expect(mockGetProvider).toHaveBeenCalledWith('anthropic');
    expect(mockProvider.generateResponse).toHaveBeenCalled();
  });
});
