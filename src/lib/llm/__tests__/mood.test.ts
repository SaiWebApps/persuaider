import { parseMoodResponse, MOOD_PROMPT_INSTRUCTION } from '../mood';
import { DEFAULT_MOOD, MOOD_STATES } from '@/types';

describe('parseMoodResponse', () => {
  describe('Strategy 1: Direct JSON parse', () => {
    it('extracts mood and content from pure JSON', () => {
      const raw = '{"mood": "firm", "content": "I disagree with your proposal."}';
      const result = parseMoodResponse(raw);
      expect(result).toEqual({
        mood: 'firm',
        content: 'I disagree with your proposal.',
      });
    });

    it('handles JSON with extra whitespace', () => {
      const raw = '  \n  {"mood": "skeptical", "content": "Really?"}  \n  ';
      const result = parseMoodResponse(raw);
      expect(result).toEqual({
        mood: 'skeptical',
        content: 'Really?',
      });
    });
  });

  describe('Strategy 2: JSON code block', () => {
    it('extracts from ```json code block', () => {
      const raw = '```json\n{"mood": "interested", "content": "Tell me more about that."}\n```';
      const result = parseMoodResponse(raw);
      expect(result).toEqual({
        mood: 'interested',
        content: 'Tell me more about that.',
      });
    });

    it('handles code block with surrounding text', () => {
      const raw = 'Here is my response:\n```json\n{"mood": "impressed", "content": "That is a compelling argument."}\n```\nEnd.';
      const result = parseMoodResponse(raw);
      expect(result).toEqual({
        mood: 'impressed',
        content: 'That is a compelling argument.',
      });
    });
  });

  describe('Strategy 3: Embedded JSON object', () => {
    it('extracts JSON object from mixed text', () => {
      const raw = 'Some preamble {"mood": "frustrated", "content": "We already discussed this."} some trailing text';
      const result = parseMoodResponse(raw);
      expect(result).toEqual({
        mood: 'frustrated',
        content: 'We already discussed this.',
      });
    });
  });

  describe('Strategy 4: Fallback', () => {
    it('returns full text as content with default mood for plain text', () => {
      const raw = 'I disagree with your proposal and think we should reconsider.';
      const result = parseMoodResponse(raw);
      expect(result).toEqual({
        mood: DEFAULT_MOOD,
        content: raw,
      });
    });

    it('handles empty string', () => {
      const result = parseMoodResponse('');
      expect(result).toEqual({
        mood: DEFAULT_MOOD,
        content: '',
      });
    });
  });

  describe('Mood validation', () => {
    it('falls back to default for invalid mood value', () => {
      const raw = '{"mood": "angry", "content": "This is unacceptable!"}';
      const result = parseMoodResponse(raw);
      expect(result.mood).toBe(DEFAULT_MOOD);
      expect(result.content).toBe('This is unacceptable!');
    });

    it('normalizes uppercase mood to lowercase', () => {
      const raw = '{"mood": "FIRM", "content": "I stand by my position."}';
      const result = parseMoodResponse(raw);
      expect(result.mood).toBe('firm');
    });

    it('normalizes mixed case mood', () => {
      const raw = '{"mood": "Skeptical", "content": "Are you sure?"}';
      const result = parseMoodResponse(raw);
      expect(result.mood).toBe('skeptical');
    });

    it('trims whitespace from mood value', () => {
      const raw = '{"mood": " considering ", "content": "Let me think about that."}';
      const result = parseMoodResponse(raw);
      expect(result.mood).toBe('considering');
    });
  });

  describe('Edge cases', () => {
    it('handles JSON with missing mood field', () => {
      const raw = '{"content": "Some text without mood"}';
      const result = parseMoodResponse(raw);
      // Falls through to fallback since isValidMoodResponse returns false
      expect(result.mood).toBe(DEFAULT_MOOD);
    });

    it('handles JSON with missing content field', () => {
      const raw = '{"mood": "firm"}';
      const result = parseMoodResponse(raw);
      expect(result.mood).toBe(DEFAULT_MOOD);
    });

    it('handles all valid mood states', () => {
      for (const mood of MOOD_STATES) {
        const raw = `{"mood": "${mood}", "content": "Test for ${mood}"}`;
        const result = parseMoodResponse(raw);
        expect(result.mood).toBe(mood);
        expect(result.content).toBe(`Test for ${mood}`);
      }
    });

    it('handles content with newlines', () => {
      const raw = '{"mood": "neutral", "content": "Line one.\\nLine two."}';
      const result = parseMoodResponse(raw);
      expect(result.mood).toBe('neutral');
      expect(result.content).toBe('Line one.\nLine two.');
    });

    it('handles content with escaped quotes', () => {
      const raw = '{"mood": "skeptical", "content": "You said \\"trust me\\" but I need proof."}';
      const result = parseMoodResponse(raw);
      expect(result.mood).toBe('skeptical');
      expect(result.content).toBe('You said "trust me" but I need proof.');
    });
  });
});

describe('MOOD_PROMPT_INSTRUCTION', () => {
  it('contains all mood state names', () => {
    for (const mood of MOOD_STATES) {
      expect(MOOD_PROMPT_INSTRUCTION).toContain(mood);
    }
  });

  it('contains JSON format instruction', () => {
    expect(MOOD_PROMPT_INSTRUCTION).toContain('"mood"');
    expect(MOOD_PROMPT_INSTRUCTION).toContain('"content"');
  });
});
