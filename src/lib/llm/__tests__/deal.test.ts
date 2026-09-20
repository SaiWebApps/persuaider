import { buildDealPrompt, parseDealResponse } from '../deal';

describe('parseDealResponse', () => {
  it('parses plain JSON and fenced JSON', () => {
    expect(parseDealResponse('{"reached":true,"terms":[{"issue":"Annual salary","agreed":118000,"learnerLastAsk":122000,"counterpartLastOffer":118000}]}')?.reached).toBe(true);
    expect(parseDealResponse('```json\n{"reached":false,"terms":[]}\n```')).toEqual({ reached: false, terms: [] });
  });

  it('returns null for an unusable reply, never a fake "no deal"', () => {
    expect(parseDealResponse('I cannot determine that.')).toBeNull();
    expect(parseDealResponse('')).toBeNull();
  });

  it('coerces bad field values per field instead of dropping the object', () => {
    const parsed = parseDealResponse('{"reached":"yes","terms":[{"issue":"Annual salary","agreed":"118k","learnerLastAsk":122000}]}');
    expect(parsed).toEqual({ reached: false, terms: [{ issue: 'Annual salary', agreed: null, learnerLastAsk: 122000, counterpartLastOffer: null }] });
  });

  it('prompt names the issues and asks for plain numbers', () => {
    const p = buildDealPrompt([{ role: 'user', content: 'x' }], [{ name: 'Annual salary', unit: 'USD', learnerWants: 'higher', learner: { target: 1, reservation: 1, weight: 1 }, counterpart: { target: 1, reservation: 1, weight: 1 } }], 'Jordan');
    expect(p).toContain('"Annual salary"');
    expect(p).toContain('no currency symbols');
  });
});
