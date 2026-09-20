import { winState } from '../win';

const msgs = (userTurns: number) => [
  { role: 'assistant' },
  ...Array.from({ length: userTurns }, () => [{ role: 'user' }, { role: 'assistant' }]).flat(),
];

describe('winState', () => {
  it('counts learner turns against maxMessages', () => {
    expect(winState(msgs(2), { type: 'manual', maxMessages: 3 })).toEqual({ userTurns: 2, maxMessages: 3, remaining: 1, limitReached: false, scoreThreshold: null });
    expect(winState(msgs(3), { type: 'manual', maxMessages: 3 }).limitReached).toBe(true);
    expect(winState(msgs(5), { type: 'manual', maxMessages: 3 }).remaining).toBe(0);
  });
  it('has no limit when maxMessages is absent', () => {
    expect(winState(msgs(40), { type: 'manual' })).toMatchObject({ maxMessages: null, remaining: null, limitReached: false });
  });
  it('exposes the score threshold only for score_threshold conditions', () => {
    expect(winState(msgs(0), { type: 'score_threshold', threshold: 70 }).scoreThreshold).toBe(70);
    expect(winState(msgs(0), { type: 'manual', maxMessages: 5 }).scoreThreshold).toBeNull();
  });
});
