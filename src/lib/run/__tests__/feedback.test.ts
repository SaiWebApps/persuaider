import { checkFeedbackReply, checkPoint, formatFigure, pointText, quotesTurn, readRunFeedback } from '../feedback';

const turns = ['I can offer   $1,700 a month if we sign for two years.', 'Fine, we have a deal at 1,800.'];
const figures = [{ issue: 'Monthly rent', target: formatFigure(1900, 'USD'), walkAway: formatFigure(1600, 'USD') }];

const ok = (raw: string, f: typeof figures | null = figures) => {
  const result = checkPoint(raw, turns, f);
  if ('problem' in result) throw new Error(result.problem);
  return result.point;
};
const fails = (raw: string, f: typeof figures | null = figures) => 'problem' in checkPoint(raw, turns, f);

describe('run feedback checks', () => {
  it('formats figures as the Deal rows do', () => {
    expect(formatFigure(1900, 'USD')).toBe('$1,900');
    expect(formatFigure(6, '%')).toBe('6%');
    expect(formatFigure(2000, 'credits')).toBe('2,000 credits');
  });

  it('matches a quote on word boundaries, case exact, whitespace collapsed', () => {
    expect(quotesTurn('$1,700 a month', turns[0]!)).toBe(true);
    expect(quotesTurn('offer $1,700', turns[0]!)).toBe(true);
    expect(quotesTurn('ffer $1,700', turns[0]!)).toBe(false);
    expect(quotesTurn('i can offer', turns[0]!)).toBe(false);
  });

  it('accepts a natural point naming a hidden figure, and keeps the quote apart', () => {
    const point = ok('When you said "I can offer $1,700 a month", you came in $200 under the $1,900 they hoped for.');
    expect(point.quote).toBe('I can offer $1,700 a month');
    expect(pointText(point)).toContain('"I can offer $1,700 a month"');
    expect(ok('Saying "I can offer" left their minimum of $1,600 unexplored.').quote).toBe('I can offer');
    expect(ok('You said "I can offer". They hoped for $1,900').quote).toBe('I can offer'); // shape is not checked
  });

  it('rejects points that break the rules', () => {
    expect(fails('You said "I can offer $1,800" and they hoped for $1,900.')).toBe(true); // not in a turn
    expect(fails('You said "i can offer" and they hoped for $1,900.')).toBe(true); // case
    expect(fails('You said "I can offer", leaving $400 of room.')).toBe(true); // no hidden figure
    expect(fails('You said "I can offer", near their $1,9000 hope.')).toBe(true); // not the figure as printed
    expect(fails('You said "I can offer" and they hoped for $1,900 as an anchor.')).toBe(true); // forbidden
  });

  it('on an unscored run checks only the quote and the jargon', () => {
    expect(ok('When you said "I can offer $1,700 a month", you showed them you were serious about staying.', null).quote).toBe('I can offer $1,700 a month');
    expect(ok('When you said "I can offer", you came in 200 dollars under them', null).quote).toBe('I can offer');
    expect(fails('When you said "I can offer", your utility was low.', null)).toBe(true);
  });

  it('needs both lists filled; saved feedback reads back as written', () => {
    const good = 'When you said "Fine, we have a deal", you closed above the $1,600 they would accept without testing for more.';
    expect('problems' in checkFeedbackReply(JSON.stringify({ wentWell: [good], goneBetter: [] }), turns, figures)).toBe(true);
    const checked = checkFeedbackReply(JSON.stringify({ wentWell: [good], goneBetter: [good] }), turns, figures);
    expect('feedback' in checked && readRunFeedback(JSON.stringify(checked.feedback))).toEqual('feedback' in checked && checked.feedback);
    expect(readRunFeedback(null)).toEqual({ wentWell: [], goneBetter: [] });
  });
});
