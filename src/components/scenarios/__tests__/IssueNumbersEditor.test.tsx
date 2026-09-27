import { render, screen } from '@testing-library/react';
import { IssueNumbersEditor, issueZone } from '../IssueNumbersEditor';
import type { GeneratedIssue } from '@/types';

// The learner wants the rent lower, so their walk-away is a ceiling and the
// counterpart's is a floor. Deal zone: 1600 – 1700.
const rent: GeneratedIssue = {
  name: 'Monthly rent',
  unit: 'USD',
  learnerWants: 'lower',
  learner: { target: 1500, reservation: 1700, weight: 100 },
  counterpart: { target: 1900, reservation: 1600, weight: 100 },
};

describe('issueZone', () => {
  it('reports the deal zone when the walk-aways overlap', () => {
    expect(issueZone(rent)).toEqual({ text: 'Deal zone: 1,600 – 1,700', severity: 'ok' });
  });

  it('warns, without erroring, when the walk-aways leave no room for a deal', () => {
    const zone = issueZone({ ...rent, counterpart: { ...rent.counterpart, reservation: 1800 } });
    expect(zone.severity).toBe('warning');
    expect(zone.text).toMatch(/no deal is possible/i);
  });

  it('warns when the walk-aways leave no room and the learner wants more', () => {
    const salary: GeneratedIssue = {
      name: 'Salary',
      unit: 'USD',
      learnerWants: 'higher',
      learner: { target: 130000, reservation: 120000, weight: 100 },
      counterpart: { target: 100000, reservation: 110000, weight: 100 },
    };
    expect(issueZone(salary).severity).toBe('warning');
    expect(issueZone({ ...salary, counterpart: { ...salary.counterpart, reservation: 125000 } }))
      .toEqual({ text: 'Deal zone: 120,000 – 125,000', severity: 'ok' });
  });

  it('errors on a target on the wrong side of its own walk-away', () => {
    const learnerWrongSide = issueZone({ ...rent, learner: { ...rent.learner, target: 1800 } });
    expect(learnerWrongSide).toEqual({ text: 'Targets must be on the right side of the walk-aways', severity: 'error' });
    const counterpartWrongSide = issueZone({ ...rent, counterpart: { ...rent.counterpart, target: 1500 } });
    expect(counterpartWrongSide.severity).toBe('error');
  });

  it('treats touching walk-aways as a single-point deal zone', () => {
    expect(issueZone({ ...rent, counterpart: { ...rent.counterpart, reservation: 1700 } }))
      .toEqual({ text: 'Deal zone: 1,700 – 1,700', severity: 'ok' });
  });
});

describe('IssueNumbersEditor', () => {
  it('shows the no-deal warning next to the Issue', () => {
    render(
      <IssueNumbersEditor
        issues={[{ ...rent, counterpart: { ...rent.counterpart, reservation: 1800 } }]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId('issue-0-zone')).toHaveTextContent(/no deal is possible/i);
  });
});
