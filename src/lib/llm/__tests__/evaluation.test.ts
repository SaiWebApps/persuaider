/**
 * @jest-environment node
 */

import { buildEvaluationPrompt, parseEvaluationResponse, evaluateConversation } from '../evaluation';

// Mock the provider factory
const mockGenerateResponse = jest.fn();
jest.mock('../providers/factory', () => ({
  LLMProviderFactory: {
    getProviderChain: () => ({
      generateResponse: mockGenerateResponse,
    }),
  },
}));

const mockPersona = {
  name: 'Alex Chen',
  description: 'A reasonable manager',
  roleType: 'Supportive but cautious manager',
  characteristics: null,
};

const mockScenario = {
  title: 'Salary Negotiation',
  description: 'Negotiate a raise with your manager.',
  userRole: 'Employee',
  aiRole: 'Manager',
  evaluationCriteria: JSON.stringify({
    frameworks: [
      {
        name: 'Preparation',
        description: 'How well prepared the negotiator is',
        elements: [
          { name: 'Market awareness', description: 'References industry benchmarks' },
          { name: 'Self-assessment', description: 'Articulates contributions' },
        ],
        weight: 0.5,
      },
      {
        name: 'Communication',
        description: 'Clarity and persuasiveness',
        elements: [
          { name: 'Clarity', description: 'Clear arguments' },
          { name: 'Confidence', description: 'Professional tone' },
        ],
        weight: 0.5,
      },
    ],
    scoringInstructions: 'Score each framework 0-100.',
  }),
};

const mockMessages = [
  { role: 'user', content: 'I would like to discuss a salary adjustment.' },
  { role: 'assistant', content: 'Sure, what did you have in mind?' },
  { role: 'user', content: 'Based on market data, I am below the 50th percentile.' },
  { role: 'assistant', content: 'Interesting. Can you share that data?' },
  { role: 'user', content: 'According to Glassdoor, the median is 15% higher.' },
];

// --- buildEvaluationPrompt tests ---

describe('buildEvaluationPrompt', () => {
  it('includes all framework names in prompt', () => {
    const prompt = buildEvaluationPrompt(mockMessages, mockScenario.evaluationCriteria, mockPersona, mockScenario);
    expect(prompt).toContain('Preparation');
    expect(prompt).toContain('Communication');
  });

  it('includes framework elements', () => {
    const prompt = buildEvaluationPrompt(mockMessages, mockScenario.evaluationCriteria, mockPersona, mockScenario);
    expect(prompt).toContain('Market awareness');
    expect(prompt).toContain('Self-assessment');
    expect(prompt).toContain('Clarity');
    expect(prompt).toContain('Confidence');
  });

  it('includes the full transcript', () => {
    const prompt = buildEvaluationPrompt(mockMessages, mockScenario.evaluationCriteria, mockPersona, mockScenario);
    expect(prompt).toContain('I would like to discuss a salary adjustment');
    expect(prompt).toContain('Sure, what did you have in mind?');
    expect(prompt).toContain('According to Glassdoor');
  });

  it('includes persona name and role', () => {
    const prompt = buildEvaluationPrompt(mockMessages, mockScenario.evaluationCriteria, mockPersona, mockScenario);
    expect(prompt).toContain('Alex Chen');
    expect(prompt).toContain('Supportive but cautious manager');
  });

  it('handles empty evaluationCriteria gracefully', () => {
    const prompt = buildEvaluationPrompt(mockMessages, '{}', mockPersona, mockScenario);
    expect(prompt).toContain('General negotiation effectiveness');
  });

  it('handles invalid JSON evaluationCriteria', () => {
    expect(() => {
      buildEvaluationPrompt(mockMessages, 'not json', mockPersona, mockScenario);
    }).not.toThrow();
  });

  it('specifies JSON output format', () => {
    const prompt = buildEvaluationPrompt(mockMessages, mockScenario.evaluationCriteria, mockPersona, mockScenario);
    expect(prompt).toContain('"overallScore"');
    expect(prompt).toContain('"winningArguments"');
    expect(prompt).toContain('"llmFeedback"');
    expect(prompt).toContain('"frameworkScores"');
  });

  it('includes scoring instructions', () => {
    const prompt = buildEvaluationPrompt(mockMessages, mockScenario.evaluationCriteria, mockPersona, mockScenario);
    expect(prompt).toContain('Score each framework 0-100');
  });
});

// --- parseEvaluationResponse tests ---

const validResponse = JSON.stringify({
  overallScore: 72,
  winningArguments: [
    { text: 'Referenced market data', framework: 'Preparation', element: 'Market awareness', effectiveness: 4 },
    { text: 'Stayed professional', framework: 'Communication', element: 'Confidence', effectiveness: 3 },
  ],
  llmFeedback: {
    whatWentWell: ['Strong data-driven approach', 'Professional tone'],
    whatToImprove: ['Could push harder on specifics'],
    specificSuggestions: ['Prepare a written summary of your achievements'],
  },
  frameworkScores: { Preparation: 75, Communication: 69 },
});

describe('parseEvaluationResponse', () => {
  it('parses valid JSON', () => {
    const result = parseEvaluationResponse(validResponse);
    expect(result.overallScore).toBe(72);
    expect(result.winningArguments).toHaveLength(2);
    expect(result.winningArguments[0].text).toBe('Referenced market data');
    expect(result.llmFeedback.whatWentWell).toHaveLength(2);
    expect(result.frameworkScores.Preparation).toBe(75);
  });

  it('parses JSON from code block', () => {
    const wrapped = '```json\n' + validResponse + '\n```';
    const result = parseEvaluationResponse(wrapped);
    expect(result.overallScore).toBe(72);
    expect(result.winningArguments).toHaveLength(2);
  });

  it('clamps overallScore above 100 to 100', () => {
    const response = JSON.stringify({ overallScore: 150, winningArguments: [], llmFeedback: {}, frameworkScores: {} });
    const result = parseEvaluationResponse(response);
    expect(result.overallScore).toBe(100);
  });

  it('clamps overallScore below 0 to 0', () => {
    const response = JSON.stringify({ overallScore: -10, winningArguments: [], llmFeedback: {}, frameworkScores: {} });
    const result = parseEvaluationResponse(response);
    expect(result.overallScore).toBe(0);
  });

  it('returns fallback on garbage input', () => {
    const result = parseEvaluationResponse('I cannot evaluate this conversation.');
    expect(result.overallScore).toBe(50);
    expect(result.winningArguments).toHaveLength(0);
    expect(result.llmFeedback.whatWentWell).toHaveLength(1);
  });

  it('handles missing winningArguments field', () => {
    const response = JSON.stringify({ overallScore: 60, llmFeedback: {}, frameworkScores: {} });
    const result = parseEvaluationResponse(response);
    expect(result.winningArguments).toEqual([]);
  });

  it('handles missing llmFeedback field', () => {
    const response = JSON.stringify({ overallScore: 60, winningArguments: [], frameworkScores: {} });
    const result = parseEvaluationResponse(response);
    expect(result.llmFeedback.whatWentWell).toBeDefined();
    expect(result.llmFeedback.whatToImprove).toBeDefined();
  });

  it('clamps effectiveness to 1-5', () => {
    const response = JSON.stringify({
      overallScore: 60,
      winningArguments: [{ text: 'test', framework: 'F', element: 'E', effectiveness: 10 }],
      llmFeedback: {},
      frameworkScores: {},
    });
    const result = parseEvaluationResponse(response);
    expect(result.winningArguments[0].effectiveness).toBe(5);
  });

  it('clamps effectiveness below 1 to 1', () => {
    const response = JSON.stringify({
      overallScore: 60,
      winningArguments: [{ text: 'test', framework: 'F', element: 'E', effectiveness: -2 }],
      llmFeedback: {},
      frameworkScores: {},
    });
    const result = parseEvaluationResponse(response);
    expect(result.winningArguments[0].effectiveness).toBe(1);
  });

  it('handles framework scores with out-of-range values', () => {
    const response = JSON.stringify({
      overallScore: 60,
      winningArguments: [],
      llmFeedback: {},
      frameworkScores: { Test: 150, Other: -5 },
    });
    const result = parseEvaluationResponse(response);
    expect(result.frameworkScores.Test).toBe(100);
    expect(result.frameworkScores.Other).toBe(0);
  });

  it('filters out invalid winning arguments', () => {
    const response = JSON.stringify({
      overallScore: 60,
      winningArguments: [
        { text: 'valid', framework: 'F', element: 'E', effectiveness: 3 },
        { framework: 'F', element: 'E', effectiveness: 3 }, // missing text
        null,
      ],
      llmFeedback: {},
      frameworkScores: {},
    });
    const result = parseEvaluationResponse(response);
    expect(result.winningArguments).toHaveLength(1);
    expect(result.winningArguments[0].text).toBe('valid');
  });
});

// --- evaluateConversation tests ---

describe('evaluateConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls LLM with temperature 0.3 and maxTokens 2000', async () => {
    mockGenerateResponse.mockResolvedValue({ content: validResponse, provider: 'anthropic' });

    await evaluateConversation(mockMessages, mockPersona, mockScenario);

    expect(mockGenerateResponse).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ temperature: 0.3, maxTokens: 2000 })
    );
  });

  it('returns parsed evaluation on success', async () => {
    mockGenerateResponse.mockResolvedValue({ content: validResponse, provider: 'anthropic' });

    const result = await evaluateConversation(mockMessages, mockPersona, mockScenario);

    expect(result.overallScore).toBe(72);
    expect(result.winningArguments).toHaveLength(2);
    expect(result.llmFeedback.whatWentWell).toHaveLength(2);
  });

  it('returns fallback when LLM fails', async () => {
    mockGenerateResponse.mockRejectedValue(new Error('API error'));

    const result = await evaluateConversation(mockMessages, mockPersona, mockScenario);

    expect(result.overallScore).toBe(50);
    expect(result.llmFeedback.whatToImprove).toContain('Evaluation could not be fully completed');
  });

  it('returns score 0 for empty conversation', async () => {
    const result = await evaluateConversation(
      [{ role: 'assistant', content: 'Hello' }],
      mockPersona,
      mockScenario
    );

    expect(result.overallScore).toBe(0);
    expect(result.llmFeedback.whatToImprove).toContain('No conversation to evaluate');
    expect(mockGenerateResponse).not.toHaveBeenCalled();
  });

  it('truncates conversations over 30 messages', async () => {
    const longMessages = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }));

    mockGenerateResponse.mockResolvedValue({ content: validResponse, provider: 'anthropic' });

    await evaluateConversation(longMessages, mockPersona, mockScenario);

    const callArgs = mockGenerateResponse.mock.calls[0];
    const systemPrompt = callArgs[0][0].content;
    // Should NOT contain early messages
    expect(systemPrompt).not.toContain('Message 0');
    // Should contain later messages
    expect(systemPrompt).toContain('Message 59');
  });
});
