import {
  asMessagesFor,
  nextSide,
  outcomeAfterTurn,
  parseTurnReply,
  readTranscript,
  type RunTurn,
} from '../transcript';

const c = (content = 'c'): RunTurn => ({ side: 'counterpart', content });
const l = (content = 'l'): RunTurn => ({ side: 'learner', content });
const max2 = { type: 'manual' as const, maxMessages: 2 };
const facts = (transcript: RunTurn[], extra: Partial<{ endsWithoutDeal: boolean; dealReached: boolean }> = {}) => ({
  transcript,
  condition: max2,
  endsWithoutDeal: false,
  dealReached: false,
  ...extra,
});

describe('run turn order', () => {
  it('the counterpart opens, the You-play side answers, then they alternate', () => {
    expect(nextSide([])).toBe('counterpart');
    expect(nextSide([c()])).toBe('learner');
    expect(nextSide([c(), l()])).toBe('counterpart');
  });

  it('each side sees its own turns as assistant turns', () => {
    expect(asMessagesFor('learner', [c('hi'), l('yo')]).map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(asMessagesFor('counterpart', [c('hi'), l('yo')]).map((m) => m.role)).toEqual(['assistant', 'user']);
  });

  it('reads a malformed transcript as empty', () => {
    expect(readTranscript('not json')).toEqual([]);
    expect(readTranscript('[{"side":"judge","content":"x"}]')).toEqual([]);
  });
});

describe('outcomeAfterTurn', () => {
  it('keeps running mid-negotiation', () => {
    expect(outcomeAfterTurn(facts([c(), l()]))).toBe('running');
    expect(outcomeAfterTurn(facts([c(), l(), c()]))).toBe('running');
  });

  it('a deal after a counterpart reply ends the run, even at the limit', () => {
    expect(outcomeAfterTurn(facts([c(), l(), c()], { dealReached: true }))).toBe('deal');
    expect(outcomeAfterTurn(facts([c(), l(), c(), l(), c()], { dealReached: true }))).toBe('deal');
  });

  it('the counterpart still answers the last You-play turn before the limit ends the run', () => {
    expect(outcomeAfterTurn(facts([c(), l(), c(), l()]))).toBe('running');
    expect(outcomeAfterTurn(facts([c(), l(), c(), l(), c()]))).toBe('limit');
  });

  it('a break-off at the limit reads Message limit reached, not No deal', () => {
    expect(outcomeAfterTurn(facts([c(), l(), c(), l(), c()], { endsWithoutDeal: true }))).toBe('limit');
    expect(outcomeAfterTurn(facts([c(), l(), c(), l()], { endsWithoutDeal: true }))).toBe('running');
  });

  it('a break-off before the limit is No deal, from either side', () => {
    expect(outcomeAfterTurn(facts([c(), l()], { endsWithoutDeal: true }))).toBe('no_deal');
    expect(outcomeAfterTurn(facts([c(), l(), c()], { endsWithoutDeal: true }))).toBe('no_deal');
  });

  it('with no maxMessages the limit is 30 You-play turns', () => {
    const turns: RunTurn[] = [c()];
    for (let i = 0; i < 30; i++) turns.push(l(), c());
    const condition = { type: 'manual' as const };
    expect(outcomeAfterTurn({ transcript: turns.slice(0, -2), condition, endsWithoutDeal: false, dealReached: false })).toBe('running');
    expect(outcomeAfterTurn({ transcript: turns, condition, endsWithoutDeal: false, dealReached: false })).toBe('limit');
  });
});

describe('parseTurnReply', () => {
  it('reads the content and the break-off flag', () => {
    expect(parseTurnReply('{"mood":"firm","endsWithoutDeal":true,"content":"We are done here."}')).toEqual({
      content: 'We are done here.',
      endsWithoutDeal: true,
    });
    expect(parseTurnReply('```json\n{"mood":"neutral","endsWithoutDeal":false,"content":"Let us talk."}\n```')).toEqual({
      content: 'Let us talk.',
      endsWithoutDeal: false,
    });
  });

  it('plain text is the content with no break-off', () => {
    expect(parseTurnReply('Fine, 1,200 a month.')).toEqual({ content: 'Fine, 1,200 a month.', endsWithoutDeal: false });
  });
});
