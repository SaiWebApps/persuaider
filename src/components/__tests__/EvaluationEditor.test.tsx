/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { EvaluationCriteria } from '@/types';

import { EvaluationEditor } from '@/components/admin/EvaluationEditor';

// Helper factories -----------------------------------------------------------

function emptyCriteria(): EvaluationCriteria {
  return { frameworks: [], scoringInstructions: '' };
}

function criteriaWithOneFramework(): EvaluationCriteria {
  return {
    frameworks: [
      {
        name: 'Negotiation Tactics',
        description: 'How well the user negotiates',
        elements: [{ name: 'Anchoring', description: 'Sets an anchor' }],
        weight: 60,
      },
    ],
    scoringInstructions: 'Score generously',
  };
}

function criteriaWithTwoFrameworks(): EvaluationCriteria {
  return {
    frameworks: [
      {
        name: 'First',
        description: 'first desc',
        elements: [
          { name: 'E1', description: 'd1' },
          { name: 'E2', description: 'd2' },
        ],
        weight: 40,
      },
      {
        name: 'Second',
        description: 'second desc',
        elements: [{ name: 'E3', description: 'd3' }],
        weight: 70,
      },
    ],
    scoringInstructions: '',
  };
}

describe('EvaluationEditor', () => {
  describe('initial render', () => {
    it('renders the editor container and header controls', () => {
      render(<EvaluationEditor value={emptyCriteria()} onChange={jest.fn()} />);
      expect(screen.getByTestId('evaluation-editor')).toBeInTheDocument();
      expect(screen.getByTestId('add-framework')).toBeInTheDocument();
      expect(screen.getByTestId('scoring-instructions')).toBeInTheDocument();
    });

    it('shows empty-state message when there are no frameworks', () => {
      render(<EvaluationEditor value={emptyCriteria()} onChange={jest.fn()} />);
      expect(
        screen.getByText(/No frameworks defined\. Add one to set evaluation criteria\./i)
      ).toBeInTheDocument();
      expect(screen.queryByTestId('framework-0')).not.toBeInTheDocument();
    });

    it('renders an existing framework and auto-expands the first one', () => {
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={jest.fn()} />);
      expect(screen.getByTestId('framework-0')).toBeInTheDocument();
      // Expanded body fields are present because index 0 is expanded by default.
      expect(screen.getByTestId('fw-name-0')).toBeInTheDocument();
      expect(screen.getByTestId('fw-desc-0')).toBeInTheDocument();
      expect(screen.getByTestId('fw-weight-0')).toBeInTheDocument();
      // The empty-state message must not show when frameworks exist.
      expect(
        screen.queryByText(/No frameworks defined/i)
      ).not.toBeInTheDocument();
    });

    it('populates expanded inputs with the provided framework values', () => {
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={jest.fn()} />);
      expect(screen.getByTestId('fw-name-0')).toHaveValue('Negotiation Tactics');
      expect(screen.getByTestId('fw-desc-0')).toHaveValue('How well the user negotiates');
      expect(screen.getByTestId('fw-weight-0')).toHaveValue('60');
      expect(screen.getByTestId('scoring-instructions')).toHaveValue('Score generously');
    });

    it('renders the second framework collapsed (body hidden)', () => {
      render(<EvaluationEditor value={criteriaWithTwoFrameworks()} onChange={jest.fn()} />);
      // Both framework cards exist.
      expect(screen.getByTestId('framework-0')).toBeInTheDocument();
      expect(screen.getByTestId('framework-1')).toBeInTheDocument();
      // Only the first is expanded.
      expect(screen.getByTestId('fw-name-0')).toBeInTheDocument();
      expect(screen.queryByTestId('fw-name-1')).not.toBeInTheDocument();
    });

    it('shows framework weight label in the collapsed header', () => {
      render(<EvaluationEditor value={criteriaWithTwoFrameworks()} onChange={jest.fn()} />);
      expect(screen.getAllByText(/Weight: 40%/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Weight: 70%/)).toBeInTheDocument();
    });

    it('falls back to a generated label when a framework name is empty', () => {
      const value: EvaluationCriteria = {
        frameworks: [
          { name: '', description: '', elements: [{ name: '', description: '' }], weight: 50 },
        ],
        scoringInstructions: '',
      };
      render(<EvaluationEditor value={value} onChange={jest.fn()} />);
      expect(screen.getByText('Framework 1')).toBeInTheDocument();
    });
  });

  describe('adding frameworks', () => {
    it('calls onChange with a new framework appended when Add Framework is clicked', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={emptyCriteria()} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('add-framework'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks).toHaveLength(1);
      expect(arg.frameworks[0]).toEqual({
        name: '',
        description: '',
        elements: [{ name: '', description: '' }],
        weight: 50,
      });
      // scoringInstructions is preserved.
      expect(arg.scoringInstructions).toBe('');
    });

    it('appends to existing frameworks without dropping them', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('add-framework'));

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks).toHaveLength(2);
      expect(arg.frameworks[0].name).toBe('Negotiation Tactics');
      expect(arg.frameworks[1].name).toBe('');
      expect(arg.scoringInstructions).toBe('Score generously');
    });
  });

  describe('removing frameworks', () => {
    it('calls onChange with the targeted framework removed', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithTwoFrameworks()} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('remove-framework-0'));

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks).toHaveLength(1);
      expect(arg.frameworks[0].name).toBe('Second');
    });

    it('removing the only framework leaves an empty frameworks array', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('remove-framework-0'));

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks).toHaveLength(0);
    });
  });

  describe('expand / collapse', () => {
    it('expands a collapsed framework when its header is clicked', () => {
      render(<EvaluationEditor value={criteriaWithTwoFrameworks()} onChange={jest.fn()} />);

      // Framework 1 body is initially hidden.
      expect(screen.queryByTestId('fw-name-1')).not.toBeInTheDocument();

      // Click the header of framework 1 (the card div is clickable; click on its name).
      fireEvent.click(screen.getByText('Second'));

      expect(screen.getByTestId('fw-name-1')).toBeInTheDocument();
    });

    it('collapses an expanded framework when its header is clicked again', () => {
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={jest.fn()} />);

      // Framework 0 starts expanded.
      expect(screen.getByTestId('fw-name-0')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Negotiation Tactics'));

      expect(screen.queryByTestId('fw-name-0')).not.toBeInTheDocument();
    });
  });

  describe('editing framework fields', () => {
    it('updates the framework name via onChange', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('fw-name-0'), { target: { value: 'New Name' } });

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks[0].name).toBe('New Name');
      // Other fields preserved.
      expect(arg.frameworks[0].weight).toBe(60);
      expect(arg.frameworks[0].elements).toEqual([{ name: 'Anchoring', description: 'Sets an anchor' }]);
    });

    it('updates the framework description via onChange', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('fw-desc-0'), {
        target: { value: 'Updated description' },
      });

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks[0].description).toBe('Updated description');
      expect(arg.frameworks[0].name).toBe('Negotiation Tactics');
    });
  });

  describe('weight changes & validation/normalization', () => {
    it('parses the slider value to an integer in onChange', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('fw-weight-0'), { target: { value: '85' } });

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks[0].weight).toBe(85);
      expect(typeof arg.frameworks[0].weight).toBe('number');
    });

    it('respects the slider min/max boundary attributes (0-100)', () => {
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={jest.fn()} />);
      const slider = screen.getByTestId('fw-weight-0');
      expect(slider).toHaveAttribute('type', 'range');
      expect(slider).toHaveAttribute('min', '0');
      expect(slider).toHaveAttribute('max', '100');
    });

    it('handles the minimum boundary weight of 0', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('fw-weight-0'), { target: { value: '0' } });

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks[0].weight).toBe(0);
    });

    it('handles the maximum boundary weight of 100', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('fw-weight-0'), { target: { value: '100' } });

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks[0].weight).toBe(100);
    });
  });

  describe('elements: add / edit / remove and boundary limits', () => {
    it('shows the element count and renders existing elements', () => {
      render(<EvaluationEditor value={criteriaWithTwoFrameworks()} onChange={jest.fn()} />);
      // Framework 0 (expanded) has 2 elements.
      expect(screen.getByText('Elements (2)')).toBeInTheDocument();
      expect(screen.getByTestId('element-0-0')).toBeInTheDocument();
      expect(screen.getByTestId('element-0-1')).toBeInTheDocument();
      expect(screen.getByTestId('el-name-0-0')).toHaveValue('E1');
      expect(screen.getByTestId('el-desc-0-1')).toHaveValue('d2');
    });

    it('adds an element to a framework via onChange', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('add-element-0'));

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks[0].elements).toHaveLength(2);
      expect(arg.frameworks[0].elements[1]).toEqual({ name: '', description: '' });
      // First element untouched.
      expect(arg.frameworks[0].elements[0]).toEqual({
        name: 'Anchoring',
        description: 'Sets an anchor',
      });
    });

    it('updates an element name via onChange', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithTwoFrameworks()} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('el-name-0-1'), { target: { value: 'Renamed' } });

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks[0].elements[1].name).toBe('Renamed');
      // Description preserved.
      expect(arg.frameworks[0].elements[1].description).toBe('d2');
      // Sibling element untouched.
      expect(arg.frameworks[0].elements[0]).toEqual({ name: 'E1', description: 'd1' });
    });

    it('updates an element description via onChange', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithTwoFrameworks()} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('el-desc-0-0'), {
        target: { value: 'new element desc' },
      });

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks[0].elements[0].description).toBe('new element desc');
      expect(arg.frameworks[0].elements[0].name).toBe('E1');
    });

    it('removes an element via onChange when more than one element exists', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithTwoFrameworks()} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('remove-element-0-0'));

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.frameworks[0].elements).toHaveLength(1);
      expect(arg.frameworks[0].elements[0]).toEqual({ name: 'E2', description: 'd2' });
    });

    it('hides the remove-element button when only one element remains (boundary)', () => {
      // Framework 0 in criteriaWithOneFramework has exactly one element.
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={jest.fn()} />);
      expect(screen.queryByTestId('remove-element-0-0')).not.toBeInTheDocument();
    });

    it('shows the remove-element button when multiple elements exist (boundary)', () => {
      render(<EvaluationEditor value={criteriaWithTwoFrameworks()} onChange={jest.fn()} />);
      expect(screen.getByTestId('remove-element-0-0')).toBeInTheDocument();
      expect(screen.getByTestId('remove-element-0-1')).toBeInTheDocument();
    });
  });

  describe('scoring instructions', () => {
    it('updates scoringInstructions via onChange while preserving frameworks', () => {
      const onChange = jest.fn();
      render(<EvaluationEditor value={criteriaWithOneFramework()} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('scoring-instructions'), {
        target: { value: 'Be strict about evidence.' },
      });

      const arg = onChange.mock.calls[0][0] as EvaluationCriteria;
      expect(arg.scoringInstructions).toBe('Be strict about evidence.');
      expect(arg.frameworks).toHaveLength(1);
      expect(arg.frameworks[0].name).toBe('Negotiation Tactics');
    });

    it('renders the character counter reflecting the current length', () => {
      const value: EvaluationCriteria = {
        frameworks: [],
        scoringInstructions: 'hello',
      };
      render(<EvaluationEditor value={value} onChange={jest.fn()} />);
      expect(screen.getByText('5/2000 characters')).toBeInTheDocument();
    });

    it('treats undefined scoringInstructions as an empty string', () => {
      // Force a value where scoringInstructions is absent to exercise the `|| ''` fallback.
      const value = { frameworks: [] } as unknown as EvaluationCriteria;
      render(<EvaluationEditor value={value} onChange={jest.fn()} />);
      expect(screen.getByTestId('scoring-instructions')).toHaveValue('');
      expect(screen.getByText('0/2000 characters')).toBeInTheDocument();
    });
  });
});
