import { weightedOverall } from '../frameworks';
import { computeDealOutcome } from '../deal';
import type { Issue } from '@/lib/codec/scenario';

const criteria = {
  frameworks: [
    { name: 'Preparation', description: '', elements: [], weight: 30 },
    { name: 'Persuasion', description: '', elements: [], weight: 40 },
    { name: 'Deal-making', description: '', elements: [], weight: 30 },
  ],
  scoringInstructions: '',
};

describe('weightedOverall', () => {
  it('is the weighted mean of matched framework scores', () => {
    expect(weightedOverall({ Preparation: 60, Persuasion: 80, 'Deal-making': 40 }, criteria)).toBe(62);
  });

  it('matches names case- and whitespace-insensitively and ignores unknown keys', () => {
    expect(weightedOverall({ ' preparation ': 100, PERSUASION: 100, Other: 0 }, criteria)).toBe(100);
  });

  it('returns null when nothing matched, so a parse failure is never a fake 50', () => {
    expect(weightedOverall({}, criteria)).toBeNull();
    expect(weightedOverall(null, criteria)).toBeNull();
    expect(weightedOverall({ Overall: 50 }, criteria)).toBeNull();
  });

  it('falls back to an unweighted mean when all matched weights are zero', () => {
    const zero = { ...criteria, frameworks: criteria.frameworks.map((f) => ({ ...f, weight: 0 })) };
    expect(weightedOverall({ Preparation: 20, Persuasion: 40 }, zero)).toBe(30);
  });

  it('clamps scores into 0-100', () => {
    expect(weightedOverall({ Preparation: 500, Persuasion: -20, 'Deal-making': 50 }, criteria)).toBe(45);
  });
});

const salary: Issue = {
  name: 'Annual salary',
  unit: 'USD',
  learnerWants: 'higher',
  learner: { target: 130000, reservation: 115000, weight: 100 },
  counterpart: { target: 108000, reservation: 120000, weight: 100 },
};

describe('computeDealOutcome', () => {
  it('is empty when the scenario has no issues', () => {
    expect(computeDealOutcome({ reached: true, terms: [] }, [])).toEqual({ reached: false, issues: [], learnerUtility: null });
  });

  it('scores a deal inside both limits and reports what was left on the table', () => {
    const out = computeDealOutcome({ reached: true, terms: [{ issue: 'annual salary', agreed: 118000, learnerLastAsk: 122000, counterpartLastOffer: 118000 }] }, [salary]);
    expect(out.reached).toBe(true);
    const [o] = out.issues;
    expect(o.agreed).toBe(118000);
    expect(o.learnerCapture).toBe(20); // (118-115)/(130-115)
    expect(o.withinBothLimits).toBe(true);
    expect(o.leftOnTable).toBe(2000);
    expect(o.counterpartReservation).toBe(120000);
    expect(out.learnerUtility).toBe(20);
  });

  it('flags a deal beyond the counterpart limit and clamps capture at 100', () => {
    const [o] = computeDealOutcome({ reached: true, terms: [{ issue: 'Annual salary', agreed: 140000 }] }, [salary]).issues;
    expect(o.withinBothLimits).toBe(false);
    expect(o.learnerCapture).toBe(100);
    expect(o.leftOnTable).toBe(0);
  });

  it('a deal below the learner walk-away scores zero capture', () => {
    const [o] = computeDealOutcome({ reached: true, terms: [{ issue: 'Annual salary', agreed: 110000 }] }, [salary]).issues;
    expect(o.learnerCapture).toBe(0);
    expect(o.withinBothLimits).toBe(false);
  });

  it('no deal: keeps the last positions, no capture', () => {
    const out = computeDealOutcome({ reached: false, terms: [{ issue: 'Annual salary', learnerLastAsk: 150000, counterpartLastOffer: 110000 }] }, [salary]);
    expect(out.reached).toBe(false);
    expect(out.issues[0].agreed).toBeNull();
    expect(out.issues[0].learnerLastAsk).toBe(150000);
    expect(out.learnerUtility).toBeNull();
  });

  it('handles issues where lower is better for the learner', () => {
    const price: Issue = { ...salary, name: 'Price', learnerWants: 'lower', learner: { target: 80, reservation: 100, weight: 1 }, counterpart: { target: 110, reservation: 90, weight: 1 } };
    const [o] = computeDealOutcome({ reached: true, terms: [{ issue: 'Price', agreed: 95 }] }, [price]).issues;
    expect(o.learnerCapture).toBe(25); // (95-100)/(80-100)
    expect(o.withinBothLimits).toBe(true);
    expect(o.leftOnTable).toBe(5);
  });
});
