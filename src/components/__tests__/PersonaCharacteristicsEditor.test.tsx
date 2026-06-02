/**
 * @jest-environment jsdom
 */

import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonaCharacteristicsEditor } from '@/components/admin/PersonaCharacteristicsEditor';
import type { PersonaCharacteristics } from '@/types';

/**
 * Stateful wrapper that mirrors how a real parent uses this controlled
 * component: it holds the value in state and re-renders with the new value
 * whenever onChange fires. This lets us drive multi-step interactions
 * (e.g. add two concerns, hit the MAX limit) without re-wiring props by hand.
 */
function ControlledHarness({
  initial = null,
  onChangeSpy,
}: {
  initial?: PersonaCharacteristics | null;
  onChangeSpy?: (val: PersonaCharacteristics) => void;
}) {
  const [value, setValue] = useState<PersonaCharacteristics | null>(initial);
  return (
    <PersonaCharacteristicsEditor
      value={value}
      onChange={(val) => {
        onChangeSpy?.(val);
        setValue(val);
      }}
    />
  );
}

function makeCharacteristics(
  overrides: Partial<PersonaCharacteristics> = {}
): PersonaCharacteristics {
  return {
    openness: 0.5,
    concerns: [],
    personality: [],
    roleBehavior: '',
    ...overrides,
  };
}

describe('PersonaCharacteristicsEditor', () => {
  describe('rendering', () => {
    it('renders the editor container and all controls', () => {
      render(<PersonaCharacteristicsEditor value={null} onChange={jest.fn()} />);

      expect(screen.getByTestId('persona-characteristics-editor')).toBeInTheDocument();
      expect(screen.getByTestId('openness-slider')).toBeInTheDocument();
      expect(screen.getByTestId('concern-input')).toBeInTheDocument();
      expect(screen.getByTestId('add-concern-button')).toBeInTheDocument();
      expect(screen.getByTestId('concerns-list')).toBeInTheDocument();
      expect(screen.getByTestId('personality-input')).toBeInTheDocument();
      expect(screen.getByTestId('add-personality-button')).toBeInTheDocument();
      expect(screen.getByTestId('personality-list')).toBeInTheDocument();
      expect(screen.getByTestId('role-behavior-textarea')).toBeInTheDocument();
    });

    it('renders default values (openness 0.5, empty lists) when value is null', () => {
      render(<PersonaCharacteristicsEditor value={null} onChange={jest.fn()} />);

      const slider = screen.getByTestId('openness-slider') as HTMLInputElement;
      expect(slider.value).toBe('0.5');
      expect(screen.getByText('Openness: 0.5')).toBeInTheDocument();

      expect(screen.getByTestId('concerns-list')).toBeEmptyDOMElement();
      expect(screen.getByTestId('personality-list')).toBeEmptyDOMElement();

      const textarea = screen.getByTestId('role-behavior-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('');

      expect(screen.getByText('Concerns (0/20)')).toBeInTheDocument();
      expect(screen.getByText('Personality (0/10)')).toBeInTheDocument();
      expect(screen.getByText('Role Behavior (0/1000)')).toBeInTheDocument();
    });

    it('renders provided value (existing concerns, personality, role behavior)', () => {
      const value = makeCharacteristics({
        openness: 0.8,
        concerns: ['Budget', 'Timeline'],
        personality: ['Analytical'],
        roleBehavior: 'Acts cautiously.',
      });
      render(<PersonaCharacteristicsEditor value={value} onChange={jest.fn()} />);

      const slider = screen.getByTestId('openness-slider') as HTMLInputElement;
      expect(slider.value).toBe('0.8');
      expect(screen.getByText('Openness: 0.8')).toBeInTheDocument();

      expect(screen.getByText('Budget')).toBeInTheDocument();
      expect(screen.getByText('Timeline')).toBeInTheDocument();
      expect(screen.getByText('Analytical')).toBeInTheDocument();

      const textarea = screen.getByTestId('role-behavior-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Acts cautiously.');

      expect(screen.getByText('Concerns (2/20)')).toBeInTheDocument();
      expect(screen.getByText('Personality (1/10)')).toBeInTheDocument();
      expect(screen.getByText('Role Behavior (16/1000)')).toBeInTheDocument();
    });
  });

  describe('openness slider', () => {
    it('calls onChange with the new openness value, preserving other fields', () => {
      const onChange = jest.fn();
      const value = makeCharacteristics({
        openness: 0.5,
        concerns: ['A'],
        personality: ['B'],
        roleBehavior: 'keep me',
      });
      render(<PersonaCharacteristicsEditor value={value} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('openness-slider'), { target: { value: '0.9' } });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        openness: 0.9,
        concerns: ['A'],
        personality: ['B'],
        roleBehavior: 'keep me',
      });
    });

    it('parses the slider value to a float (0 lower bound)', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('openness-slider'), { target: { value: '0' } });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ openness: 0 })
      );
    });
  });

  describe('concerns', () => {
    it('adds a concern via the Add button', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('concern-input'), { target: { value: 'Cost' } });
      fireEvent.click(screen.getByTestId('add-concern-button'));

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ concerns: ['Cost'] })
      );
    });

    it('trims whitespace when adding a concern', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('concern-input'), { target: { value: '  Risk  ' } });
      fireEvent.click(screen.getByTestId('add-concern-button'));

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ concerns: ['Risk'] })
      );
    });

    it('adds a concern via the Enter key', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      const input = screen.getByTestId('concern-input');
      fireEvent.change(input, { target: { value: 'Security' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ concerns: ['Security'] })
      );
    });

    it('does not add a concern when input is empty or whitespace only', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      // empty input -> button disabled and handler bails
      fireEvent.click(screen.getByTestId('add-concern-button'));
      expect(onChange).not.toHaveBeenCalled();

      // whitespace -> trim yields empty, handler returns early
      fireEvent.change(screen.getByTestId('concern-input'), { target: { value: '   ' } });
      fireEvent.keyDown(screen.getByTestId('concern-input'), { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not call onChange for non-Enter keys', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      const input = screen.getByTestId('concern-input');
      fireEvent.change(input, { target: { value: 'Cost' } });
      fireEvent.keyDown(input, { key: 'a' });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('deduplicates: adding an existing concern does not call onChange', () => {
      const onChange = jest.fn();
      const value = makeCharacteristics({ concerns: ['Budget'] });
      render(<PersonaCharacteristicsEditor value={value} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('concern-input'), { target: { value: 'Budget' } });
      fireEvent.click(screen.getByTestId('add-concern-button'));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('clears the input after a successful add (controlled harness)', () => {
      render(<ControlledHarness />);

      const input = screen.getByTestId('concern-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'First' } });
      fireEvent.click(screen.getByTestId('add-concern-button'));

      expect(input.value).toBe('');
      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Concerns (1/20)')).toBeInTheDocument();
    });

    it('adds multiple distinct concerns sequentially (controlled harness)', () => {
      const onChangeSpy = jest.fn();
      render(<ControlledHarness onChangeSpy={onChangeSpy} />);

      const input = screen.getByTestId('concern-input');
      fireEvent.change(input, { target: { value: 'One' } });
      fireEvent.click(screen.getByTestId('add-concern-button'));
      fireEvent.change(input, { target: { value: 'Two' } });
      fireEvent.click(screen.getByTestId('add-concern-button'));

      expect(onChangeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ concerns: ['One', 'Two'] })
      );
      expect(screen.getByText('Concerns (2/20)')).toBeInTheDocument();
    });

    it('enforces MAX_CONCERNS = 20: input/button disabled and no add at limit', () => {
      const onChange = jest.fn();
      const concerns = Array.from({ length: 20 }, (_, i) => `concern-${i}`);
      const value = makeCharacteristics({ concerns });
      render(<PersonaCharacteristicsEditor value={value} onChange={onChange} />);

      expect(screen.getByText('Concerns (20/20)')).toBeInTheDocument();

      const input = screen.getByTestId('concern-input') as HTMLInputElement;
      const button = screen.getByTestId('add-concern-button') as HTMLButtonElement;
      expect(input).toBeDisabled();
      expect(button).toBeDisabled();

      // Even firing the keydown handler directly must not add beyond the limit.
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('removes a concern by index, preserving the rest', () => {
      const onChange = jest.fn();
      const value = makeCharacteristics({ concerns: ['Alpha', 'Beta', 'Gamma'] });
      render(<PersonaCharacteristicsEditor value={value} onChange={onChange} />);

      // Each concern chip has a remove "x" button; click the middle one.
      const removeButtons = screen.getAllByRole('button', { name: 'x' });
      // The first three remove buttons belong to concerns (then personality after).
      fireEvent.click(removeButtons[1]);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ concerns: ['Alpha', 'Gamma'] })
      );
    });
  });

  describe('personality', () => {
    it('adds a trait via the Add button', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('personality-input'), { target: { value: 'Curious' } });
      fireEvent.click(screen.getByTestId('add-personality-button'));

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ personality: ['Curious'] })
      );
    });

    it('adds a trait via the Enter key and trims whitespace', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      const input = screen.getByTestId('personality-input');
      fireEvent.change(input, { target: { value: '  Bold  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ personality: ['Bold'] })
      );
    });

    it('deduplicates: adding an existing trait does not call onChange', () => {
      const onChange = jest.fn();
      const value = makeCharacteristics({ personality: ['Analytical'] });
      render(<PersonaCharacteristicsEditor value={value} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('personality-input'), { target: { value: 'Analytical' } });
      fireEvent.click(screen.getByTestId('add-personality-button'));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not add an empty/whitespace trait', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('add-personality-button'));
      expect(onChange).not.toHaveBeenCalled();

      fireEvent.change(screen.getByTestId('personality-input'), { target: { value: '   ' } });
      fireEvent.keyDown(screen.getByTestId('personality-input'), { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('adds multiple distinct traits sequentially (controlled harness)', () => {
      const onChangeSpy = jest.fn();
      render(<ControlledHarness onChangeSpy={onChangeSpy} />);

      const input = screen.getByTestId('personality-input');
      fireEvent.change(input, { target: { value: 'Warm' } });
      fireEvent.click(screen.getByTestId('add-personality-button'));
      fireEvent.change(input, { target: { value: 'Direct' } });
      fireEvent.click(screen.getByTestId('add-personality-button'));

      expect(onChangeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ personality: ['Warm', 'Direct'] })
      );
      expect(screen.getByText('Personality (2/10)')).toBeInTheDocument();
    });

    it('enforces MAX_PERSONALITY_TAGS = 10: input/button disabled and no add at limit', () => {
      const onChange = jest.fn();
      const personality = Array.from({ length: 10 }, (_, i) => `trait-${i}`);
      const value = makeCharacteristics({ personality });
      render(<PersonaCharacteristicsEditor value={value} onChange={onChange} />);

      expect(screen.getByText('Personality (10/10)')).toBeInTheDocument();

      const input = screen.getByTestId('personality-input') as HTMLInputElement;
      const button = screen.getByTestId('add-personality-button') as HTMLButtonElement;
      expect(input).toBeDisabled();
      expect(button).toBeDisabled();

      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('removes a trait by index, preserving the rest', () => {
      const onChange = jest.fn();
      const value = makeCharacteristics({
        concerns: ['C1'],
        personality: ['P1', 'P2', 'P3'],
      });
      render(<PersonaCharacteristicsEditor value={value} onChange={onChange} />);

      const removeButtons = screen.getAllByRole('button', { name: 'x' });
      // Order: 1 concern remove button, then 3 personality remove buttons.
      // Personality buttons start at index 1; remove the first personality trait.
      fireEvent.click(removeButtons[1]);

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ personality: ['P2', 'P3'] })
      );
    });
  });

  describe('role behavior', () => {
    it('calls onChange with the typed text, preserving other fields', () => {
      const onChange = jest.fn();
      const value = makeCharacteristics({ openness: 0.7, concerns: ['x'] });
      render(<PersonaCharacteristicsEditor value={value} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('role-behavior-textarea'), {
        target: { value: 'Behaves professionally.' },
      });

      expect(onChange).toHaveBeenCalledWith({
        openness: 0.7,
        concerns: ['x'],
        personality: [],
        roleBehavior: 'Behaves professionally.',
      });
    });

    it('truncates role behavior to MAX_ROLE_BEHAVIOR_LENGTH = 1000 chars', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      const longText = 'a'.repeat(1500);
      fireEvent.change(screen.getByTestId('role-behavior-textarea'), {
        target: { value: longText },
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const passed = onChange.mock.calls[0][0] as PersonaCharacteristics;
      expect(passed.roleBehavior).toHaveLength(1000);
      expect(passed.roleBehavior).toBe('a'.repeat(1000));
    });

    it('does not truncate text at or below the limit', () => {
      const onChange = jest.fn();
      render(<PersonaCharacteristicsEditor value={null} onChange={onChange} />);

      const exactText = 'b'.repeat(1000);
      fireEvent.change(screen.getByTestId('role-behavior-textarea'), {
        target: { value: exactText },
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ roleBehavior: exactText })
      );
    });

    it('updates the character counter as text changes (controlled harness)', () => {
      render(<ControlledHarness />);

      fireEvent.change(screen.getByTestId('role-behavior-textarea'), {
        target: { value: 'hello' },
      });

      expect(screen.getByText('Role Behavior (5/1000)')).toBeInTheDocument();
      const textarea = screen.getByTestId('role-behavior-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('hello');
    });
  });
});
