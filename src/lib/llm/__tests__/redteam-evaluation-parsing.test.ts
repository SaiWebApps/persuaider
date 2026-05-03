/**
 * @jest-environment node
 */

/**
 * Red-team tests for the evaluation and mood parsing logic:
 * - LLM returning scores above 100 or below 0
 * - LLM returning completely non-JSON response
 * - Invalid mood strings
 * - Edge cases in JSON extraction
 */

import { parseEvaluationResponse, evaluateConversation, buildEvaluationPrompt } from '../../llm/evaluation';
import { parseMoodResponse } from '../../llm/mood';

// Mock the LLM provider for evaluateConversation tests
const mockGenerateResponse = jest.fn();
jest.mock('../../llm/providers/factory', () => ({
  LLMProviderFactory: {
    getProviderChain: () => ({
      generateResponse: mockGenerateResponse,
    }),
  },
}));

const mockPersona = {
  name: 'Alex Chen',
  description: 'A tough manager',
  roleType: 'Manager',
  characteristics: null,
};

const mockScenario = {
  title: 'Salary Negotiation',
  description: 'Negotiate a raise',
  userRole: 'Employee',
  aiRole: 'Manager',
  evaluationCriteria: '{}',
};

// =============================================================================
// parseEvaluationResponse - Score Clamping
// =============================================================================

describe('parseEvaluationResponse - Score Boundary Tests', () => {
  it('clamps overallScore of 999 to 100', () => {
    const response = JSON.stringify({
      overallScore: 999,
      winningArguments: [],
      llmFeedback: {},
      frameworkScores: {},
    });
    const result = parseEvaluationResponse(response);
    expect(result.overallScore).toBe(100);
  });

  it('clamps overallScore of -999 to 0', () => {
    const response = JSON.stringify({
      overallScore: -999,
      winningArguments: [],
      llmFeedback: {},
      frameworkScores: {},
    });
    const result = parseEvaluationResponse(response);
    expect(result.overallScore).toBe(0);
  });

  it('handles overallScore as string "85"', () => {
    const response = JSON.stringify({
      overallScore: '85',
      winningArguments: [],
      llmFeedback: {},
      frameworkScores: {},
    });
    const result = parseEvaluationResponse(response);
    expect(result.overallScore).toBe(85);
  });

  it('handles overallScore as NaN (uses fallback 50)', () => {
    const response = JSON.stringify({
      overallScore: 'not a number',
      winningArguments: [],
      llmFeedback: {},
      frameworkScores: {},
    });
    const result = parseEvaluationResponse(response);
    expect(result.overallScore).toBe(50);
  });

  it('handles overallScore of exactly 0', () => {
    const response = JSON.stringify({
      overallScore: 0,
      winningArguments: [],
      llmFeedback: {},
      frameworkScores: {},
    });
    const result = parseEvaluationResponse(response);
    expect(result.overallScore).toBe(0);
  });

  it('handles overallScore of exactly 100', () => {
    const response = JSON.stringify({
      overallScore: 100,
      winningArguments: [],
      llmFeedback: {},
      frameworkScores: {},
    });
    const result = parseEvaluationResponse(response);
    expect(result.overallScore).toBe(100);
  });

  it('clamps framework scores above 100', () => {
    const response = JSON.stringify({
      overallScore: 50,
      winningArguments: [],
      llmFeedback: {},
      frameworkScores: { Preparation: 200, Communication: 110 },
    });
    const result = parseEvaluationResponse(response);
    expect(result.frameworkScores.Preparation).toBe(100);
    expect(result.frameworkScores.Communication).toBe(100);
  });

  it('clamps framework scores below 0', () => {
    const response = JSON.stringify({
      overallScore: 50,
      winningArguments: [],
      llmFeedback: {},
      frameworkScores: { Preparation: -50, Communication: -1 },
    });
    const result = parseEvaluationResponse(response);
    expect(result.frameworkScores.Preparation).toBe(0);
    expect(result.frameworkScores.Communication).toBe(0);
  });
});

// =============================================================================
// parseEvaluationResponse - Non-JSON Garbage
// =============================================================================

describe('parseEvaluationResponse - Non-JSON Responses', () => {
  it('returns fallback for completely non-JSON response', () => {
    const garbage = 'I cannot evaluate this conversation because it was too short.';
    const result = parseEvaluationResponse(garbage);
    expect(result.overallScore).toBe(50);
    expect(result.winningArguments).toEqual([]);
    expect(result.llmFeedback.whatWentWell).toHaveLength(1);
  });

  it('returns fallback for HTML response', () => {
    const html = '<html><body><h1>Error 500</h1></body></html>';
    const result = parseEvaluationResponse(html);
    expect(result.overallScore).toBe(50);
  });

  it('returns fallback for empty string', () => {
    const result = parseEvaluationResponse('');
    expect(result.overallScore).toBe(50);
  });

  it('returns fallback for just whitespace', () => {
    const result = parseEvaluationResponse('   \n\n  ');
    expect(result.overallScore).toBe(50);
  });

  it('returns fallback for partial JSON (truncated)', () => {
    const truncated = '{"overallScore": 72, "winningArguments": [{"text": "Good point';
    const result = parseEvaluationResponse(truncated);
    // Should fallback since JSON is invalid
    expect(result.overallScore).toBe(50);
  });

  it('extracts JSON from markdown with surrounding text', () => {
    const withText = `Here's my evaluation:

\`\`\`json
{
  "overallScore": 78,
  "winningArguments": [{"text": "Used data", "framework": "Prep", "element": "Research", "effectiveness": 4}],
  "llmFeedback": {"whatWentWell": ["Good prep"], "whatToImprove": ["Be bolder"], "specificSuggestions": ["Push harder"]},
  "frameworkScores": {"Prep": 80}
}
\`\`\`

Hope this helps!`;
    const result = parseEvaluationResponse(withText);
    expect(result.overallScore).toBe(78);
    expect(result.winningArguments).toHaveLength(1);
  });

  it('handles JSON with extra trailing commas (invalid strict JSON)', () => {
    // Some LLMs produce trailing commas
    const withTrailing = '{"overallScore": 60, "winningArguments": [], "llmFeedback": {}, "frameworkScores": {},}';
    const result = parseEvaluationResponse(withTrailing);
    // This is invalid JSON, so it should fallback
    expect(result.overallScore).toBe(50);
  });
});

// =============================================================================
// evaluateConversation - No User Messages
// =============================================================================

describe('evaluateConversation - Edge Cases', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns score 0 when all messages are from assistant (no user messages)', async () => {
    const assistantOnlyMessages = [
      { role: 'assistant', content: 'Hello!' },
      { role: 'assistant', content: 'Are you there?' },
      { role: 'assistant', content: 'I guess not...' },
    ];

    const result = await evaluateConversation(assistantOnlyMessages, mockPersona, mockScenario);
    expect(result.overallScore).toBe(0);
    expect(result.llmFeedback.whatToImprove).toContain('No conversation to evaluate');
    // Should NOT call the LLM at all
    expect(mockGenerateResponse).not.toHaveBeenCalled();
  });

  it('returns score 0 for empty messages array', async () => {
    const result = await evaluateConversation([], mockPersona, mockScenario);
    expect(result.overallScore).toBe(0);
    expect(mockGenerateResponse).not.toHaveBeenCalled();
  });

  it('returns score 0 when only 1 assistant message exists (greeting only)', async () => {
    const result = await evaluateConversation(
      [{ role: 'assistant', content: "Hello, I'm Alex. Let's discuss." }],
      mockPersona,
      mockScenario
    );
    expect(result.overallScore).toBe(0);
    expect(result.llmFeedback.specificSuggestions).toContain(
      'Try exchanging a few messages before ending the negotiation'
    );
  });

  it('calls LLM when at least one user message exists', async () => {
    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({
        overallScore: 60,
        winningArguments: [],
        llmFeedback: { whatWentWell: ['Tried'], whatToImprove: ['More effort'], specificSuggestions: ['Practice'] },
        frameworkScores: {},
      }),
      provider: 'anthropic',
    });

    const messages = [
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'I want a raise' },
    ];

    const result = await evaluateConversation(messages, mockPersona, mockScenario);
    expect(mockGenerateResponse).toHaveBeenCalled();
    expect(result.overallScore).toBe(60);
  });

  it('truncates to last 30 messages for very long conversations', async () => {
    const longMessages = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message number ${i}`,
    }));

    mockGenerateResponse.mockResolvedValue({
      content: JSON.stringify({
        overallScore: 70,
        winningArguments: [],
        llmFeedback: { whatWentWell: ['Long conversation'], whatToImprove: [], specificSuggestions: [] },
        frameworkScores: {},
      }),
      provider: 'anthropic',
    });

    await evaluateConversation(longMessages, mockPersona, mockScenario);

    const callArgs = mockGenerateResponse.mock.calls[0];
    const systemPrompt = callArgs[0][0].content;
    // Should NOT contain early messages (message 0-29)
    expect(systemPrompt).not.toContain('Message number 0');
    expect(systemPrompt).not.toContain('Message number 29');
    // Should contain later messages (30+)
    expect(systemPrompt).toContain('Message number 59');
    expect(systemPrompt).toContain('Message number 30');
  });

  it('returns fallback score of 50 when LLM throws exception', async () => {
    mockGenerateResponse.mockRejectedValue(new Error('Rate limited'));

    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    const result = await evaluateConversation(messages, mockPersona, mockScenario);
    expect(result.overallScore).toBe(50);
    expect(result.llmFeedback.whatToImprove).toContain('Evaluation could not be fully completed');
  });
});

// =============================================================================
// parseMoodResponse - Red Team
// =============================================================================

describe('parseMoodResponse - Red Team', () => {
  it('returns default mood for completely non-JSON response', () => {
    const result = parseMoodResponse("I think we should proceed with caution here.");
    expect(result.mood).toBe('neutral');
    expect(result.content).toBe("I think we should proceed with caution here.");
  });

  it('returns default mood for invalid mood string', () => {
    const response = JSON.stringify({ mood: 'angry', content: 'This is outrageous!' });
    const result = parseMoodResponse(response);
    // 'angry' is not in MOOD_STATES, should fall back to 'neutral'
    expect(result.mood).toBe('neutral');
    expect(result.content).toBe('This is outrageous!');
  });

  it('handles mood with different casing', () => {
    const response = JSON.stringify({ mood: 'IMPRESSED', content: 'Wow!' });
    const result = parseMoodResponse(response);
    expect(result.mood).toBe('impressed');
  });

  it('handles mood with whitespace', () => {
    const response = JSON.stringify({ mood: ' skeptical ', content: 'Hmm.' });
    const result = parseMoodResponse(response);
    expect(result.mood).toBe('skeptical');
  });

  it('extracts mood from code block format', () => {
    const response = '```json\n{"mood": "firm", "content": "No deal."}\n```';
    const result = parseMoodResponse(response);
    expect(result.mood).toBe('firm');
    expect(result.content).toBe('No deal.');
  });

  it('returns full raw response as content when no JSON found', () => {
    const rawText = 'Let me think about that proposal carefully. I have concerns about the budget impact.';
    const result = parseMoodResponse(rawText);
    expect(result.content).toBe(rawText);
    expect(result.mood).toBe('neutral');
  });

  it('handles response with only mood field (missing content)', () => {
    const response = JSON.stringify({ mood: 'interested' });
    const result = parseMoodResponse(response);
    // Missing content field means isValidMoodResponse returns false
    // Falls through to fallback: entire raw string is content
    expect(result.mood).toBe('neutral');
  });

  it('handles response with only content field (missing mood)', () => {
    const response = JSON.stringify({ content: 'Hello there' });
    const result = parseMoodResponse(response);
    // Missing mood field means isValidMoodResponse returns false
    expect(result.mood).toBe('neutral');
  });

  it('handles empty string response', () => {
    const result = parseMoodResponse('');
    expect(result.content).toBe('');
    expect(result.mood).toBe('neutral');
  });
});

// =============================================================================
// buildEvaluationPrompt - Edge Cases
// =============================================================================

describe('buildEvaluationPrompt - Edge Cases', () => {
  it('handles evaluationCriteria as invalid JSON string', () => {
    const prompt = buildEvaluationPrompt(
      [{ role: 'user', content: 'test' }],
      'not valid json {{{{',
      mockPersona,
      mockScenario
    );
    // Should not throw and should include fallback
    expect(prompt).toContain('General negotiation effectiveness');
  });

  it('handles evaluationCriteria with empty frameworks array', () => {
    const criteria = JSON.stringify({ frameworks: [] });
    const prompt = buildEvaluationPrompt(
      [{ role: 'user', content: 'test' }],
      criteria,
      mockPersona,
      mockScenario
    );
    expect(prompt).toContain('General negotiation effectiveness');
  });

  it('builds correct transcript format', () => {
    const messages = [
      { role: 'user', content: 'I want a raise' },
      { role: 'assistant', content: 'Tell me more' },
    ];
    const prompt = buildEvaluationPrompt(messages, '{}', mockPersona, mockScenario);
    expect(prompt).toContain('TRAINEE: I want a raise');
    expect(prompt).toContain('Alex Chen: Tell me more');
  });
});
