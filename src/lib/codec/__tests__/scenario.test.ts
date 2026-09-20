import {
  DEFAULT_EVALUATION_CRITERIA,
  DEFAULT_WIN_CONDITION,
  parseCharacteristicsInput,
  parseEvaluationCriteriaInput,
  parseTagsInput,
  parseWinConditionInput,
  readCharacteristics,
  readEvaluationCriteria,
  readTags,
  readWinCondition,
  serialize,
} from '../scenario';
import { ValidationError } from '@/types';

const criteria = {
  frameworks: [{ name: 'CLEAR', description: 'd', elements: [{ name: 'Capture', description: 'x' }], weight: 60 }],
  scoringInstructions: 'be strict',
};

describe('read path never throws and falls back to defaults', () => {
  it.each([null, undefined, '', '{}', 'not json', '[]', '{"frameworks":"nope"}', '{"frameworks":[]}'])(
    'evaluationCriteria %p -> default',
    (text) => {
      expect(readEvaluationCriteria(text as string)).toEqual(DEFAULT_EVALUATION_CRITERIA);
    }
  );

  it('read path keeps a legacy framework that lacks weight and elements', () => {
    const legacy = '{"frameworks":[{"name":"Old","description":"d"}],"scoringInstructions":"s"}';
    expect(readEvaluationCriteria(legacy)).toEqual({
      frameworks: [{ name: 'Old', description: 'd', elements: [], weight: 50 }],
      scoringInstructions: 's',
    });
  });

  it('round-trips valid criteria', () => {
    expect(readEvaluationCriteria(serialize(criteria))).toEqual(criteria);
  });

  it.each([null, '', 'garbage', '{"type":"weird"}'])('winCondition %p -> default', (text) => {
    expect(readWinCondition(text)).toEqual(DEFAULT_WIN_CONDITION);
  });

  it('winCondition accepts legacy rows without maxMessages', () => {
    expect(readWinCondition('{"type":"manual"}')).toEqual({ type: 'manual', maxMessages: undefined });
  });

  it.each([null, '', '{}', '"x"', '[1,2]', '["a","A"]'])('tags %p -> []', (text) => {
    expect(readTags(text)).toEqual([]);
  });

  it('tags round-trip', () => {
    expect(readTags('["sales","hr"]')).toEqual(['sales', 'hr']);
  });

  it('characteristics: partial rows are fine, junk is {}', () => {
    expect(readCharacteristics('{"openness":0.2}')).toEqual({ openness: 0.2 });
    expect(readCharacteristics('{"openness":"high","concerns":["cost"]}')).toEqual({ concerns: ['cost'] });
    expect(readCharacteristics(null)).toEqual({});
  });
});

describe('write path is strict and names the field', () => {
  const expectError = (fn: () => unknown, fragment: string) => {
    expect(fn).toThrow(ValidationError);
    expect(fn).toThrow(fragment);
  };

  it('accepts valid criteria and fills scoringInstructions', () => {
    const { scoringInstructions, ...rest } = criteria;
    void scoringInstructions;
    expect(parseEvaluationCriteriaInput(rest)).toEqual({ ...rest, scoringInstructions: '' });
  });

  it('rejects a JSON string instead of an object', () => {
    expectError(() => parseEvaluationCriteriaInput('{"frameworks":[]}'), 'must be an object, not a string');
  });

  it('rejects bad framework names with the path', () => {
    expectError(
      () => parseEvaluationCriteriaInput({ frameworks: [{ ...criteria.frameworks[0], name: '' }] }),
      'evaluationCriteria.frameworks[0].name must be a string (1-100 chars)'
    );
  });

  it('rejects weight out of range and long scoringInstructions', () => {
    expectError(() => parseEvaluationCriteriaInput({ frameworks: [{ ...criteria.frameworks[0], weight: 101 }] }), 'weight');
    expectError(
      () => parseEvaluationCriteriaInput({ frameworks: [], scoringInstructions: 'x'.repeat(2001) }),
      'scoringInstructions'
    );
  });

  it('winCondition: score_threshold needs a threshold; type is checked', () => {
    expectError(() => parseWinConditionInput({ type: 'score_threshold' }), 'threshold');
    expectError(() => parseWinConditionInput({ type: 'other' }), 'type');
    expect(parseWinConditionInput({ type: 'manual', maxMessages: null })).toEqual({ type: 'manual', maxMessages: undefined });
  });

  it('tags: count, length, duplicates', () => {
    expectError(() => parseTagsInput(new Array(11).fill('a')), '10');
    expectError(() => parseTagsInput(['x'.repeat(51)]), '50');
    expectError(() => parseTagsInput(['Sales', 'sales']), 'duplicate');
    expect(parseTagsInput(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('characteristics: shape and ranges', () => {
    expectError(() => parseCharacteristicsInput([]), 'characteristics must be an object');
    expectError(() => parseCharacteristicsInput({ openness: 2 }), 'openness must be between 0 and 1');
    expectError(() => parseCharacteristicsInput({ concerns: new Array(21).fill('c') }), 'concerns cannot exceed 20 items');
    expectError(() => parseCharacteristicsInput({ roleBehavior: 5 }), 'roleBehavior must be a string');
    expect(parseCharacteristicsInput({ openness: 0.4, personality: ['calm'] })).toEqual({ openness: 0.4, personality: ['calm'] });
  });
});

describe('issues', () => {
  const { readIssues, parseIssuesInput } = jest.requireActual('../scenario') as typeof import('../scenario');
  const salary = {
    name: 'Annual salary',
    unit: 'USD',
    learnerWants: 'higher',
    learner: { target: 130000, reservation: 115000, weight: 100 },
    counterpart: { target: 108000, reservation: 120000, weight: 100 },
  };

  it('read path: junk is an empty list, valid rows round-trip', () => {
    expect(readIssues(null)).toEqual([]);
    expect(readIssues('nope')).toEqual([]);
    expect(readIssues(JSON.stringify([salary]))).toEqual([salary]);
  });

  it('write path: names the field and fills weight', () => {
    expect(() => parseIssuesInput([{ ...salary, learnerWants: 'sideways' }])).toThrow('issues[0].learnerWants must be');
    expect(() => parseIssuesInput([{ ...salary, counterpart: { target: 1 } }])).toThrow('issues[0].counterpart.reservation');
    const { weight, ...side } = salary.learner;
    void weight;
    expect(parseIssuesInput([{ ...salary, learner: side }])[0].learner.weight).toBe(100);
  });
});
