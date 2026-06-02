/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { WinConditionEditor } from '../admin/WinConditionEditor';
import type { WinCondition } from '@/types';

const manualValue: WinCondition = { type: 'manual' };
const thresholdValue: WinCondition = { type: 'score_threshold', threshold: 75 };

describe('WinConditionEditor', () => {
  describe('rendering', () => {
    it('renders the editor container', () => {
      render(<WinConditionEditor value={manualValue} onChange={() => {}} />);
      expect(screen.getByTestId('win-condition-editor')).toBeInTheDocument();
    });

    it('renders the section heading and both mode radios', () => {
      render(<WinConditionEditor value={manualValue} onChange={() => {}} />);
      expect(screen.getByText('Win Condition')).toBeInTheDocument();
      expect(screen.getByTestId('win-type-manual')).toBeInTheDocument();
      expect(screen.getByTestId('win-type-threshold')).toBeInTheDocument();
    });

    it('renders the max-messages input regardless of mode', () => {
      render(<WinConditionEditor value={manualValue} onChange={() => {}} />);
      expect(screen.getByTestId('win-max-messages')).toBeInTheDocument();
    });
  });

  describe('mode selection state', () => {
    it('checks the manual radio when type is manual', () => {
      render(<WinConditionEditor value={manualValue} onChange={() => {}} />);
      expect(screen.getByTestId('win-type-manual')).toBeChecked();
      expect(screen.getByTestId('win-type-threshold')).not.toBeChecked();
    });

    it('checks the threshold radio when type is score_threshold', () => {
      render(<WinConditionEditor value={thresholdValue} onChange={() => {}} />);
      expect(screen.getByTestId('win-type-threshold')).toBeChecked();
      expect(screen.getByTestId('win-type-manual')).not.toBeChecked();
    });

    it('hides the threshold input in manual mode', () => {
      render(<WinConditionEditor value={manualValue} onChange={() => {}} />);
      expect(screen.queryByTestId('win-threshold')).not.toBeInTheDocument();
    });

    it('shows the threshold input in score_threshold mode', () => {
      render(<WinConditionEditor value={thresholdValue} onChange={() => {}} />);
      expect(screen.getByTestId('win-threshold')).toBeInTheDocument();
    });
  });

  describe('mode toggle onChange shape', () => {
    it('emits a manual win condition when the manual radio is selected', () => {
      const onChange = jest.fn();
      render(<WinConditionEditor value={thresholdValue} onChange={onChange} />);
      fireEvent.click(screen.getByTestId('win-type-manual'));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ type: 'manual', maxMessages: undefined });
    });

    it('preserves maxMessages when switching to manual mode', () => {
      const onChange = jest.fn();
      const withCap: WinCondition = { type: 'score_threshold', threshold: 80, maxMessages: 25 };
      render(<WinConditionEditor value={withCap} onChange={onChange} />);
      fireEvent.click(screen.getByTestId('win-type-manual'));
      expect(onChange).toHaveBeenCalledWith({ type: 'manual', maxMessages: 25 });
    });

    it('emits a score_threshold win condition with default threshold 75 when threshold radio is selected', () => {
      const onChange = jest.fn();
      render(<WinConditionEditor value={manualValue} onChange={onChange} />);
      fireEvent.click(screen.getByTestId('win-type-threshold'));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({
        type: 'score_threshold',
        threshold: 75,
        maxMessages: undefined,
      });
    });

    it('preserves maxMessages when switching to score_threshold mode', () => {
      const onChange = jest.fn();
      const withCap: WinCondition = { type: 'manual', maxMessages: 40 };
      render(<WinConditionEditor value={withCap} onChange={onChange} />);
      fireEvent.click(screen.getByTestId('win-type-threshold'));
      expect(onChange).toHaveBeenCalledWith({
        type: 'score_threshold',
        threshold: 75,
        maxMessages: 40,
      });
    });
  });

  describe('threshold input', () => {
    it('defaults the displayed threshold to 75 when none is provided', () => {
      const noThreshold: WinCondition = { type: 'score_threshold' };
      render(<WinConditionEditor value={noThreshold} onChange={() => {}} />);
      expect(screen.getByTestId('win-threshold')).toHaveValue(75);
    });

    it('displays the provided threshold value', () => {
      render(<WinConditionEditor value={{ type: 'score_threshold', threshold: 90 }} onChange={() => {}} />);
      expect(screen.getByTestId('win-threshold')).toHaveValue(90);
    });

    it('emits the updated threshold on change while preserving the rest of the value', () => {
      const onChange = jest.fn();
      const withCap: WinCondition = { type: 'score_threshold', threshold: 75, maxMessages: 30 };
      render(<WinConditionEditor value={withCap} onChange={onChange} />);
      fireEvent.change(screen.getByTestId('win-threshold'), { target: { value: '60' } });
      expect(onChange).toHaveBeenCalledWith({
        type: 'score_threshold',
        threshold: 60,
        maxMessages: 30,
      });
    });

    it('falls back to threshold 1 when the threshold input is cleared (parseInt NaN)', () => {
      const onChange = jest.fn();
      render(<WinConditionEditor value={thresholdValue} onChange={onChange} />);
      fireEvent.change(screen.getByTestId('win-threshold'), { target: { value: '' } });
      expect(onChange).toHaveBeenCalledWith({
        type: 'score_threshold',
        threshold: 1,
        maxMessages: undefined,
      });
    });

    it('falls back to threshold 1 when the value parses to 0', () => {
      const onChange = jest.fn();
      render(<WinConditionEditor value={thresholdValue} onChange={onChange} />);
      fireEvent.change(screen.getByTestId('win-threshold'), { target: { value: '0' } });
      expect(onChange).toHaveBeenCalledWith({
        type: 'score_threshold',
        threshold: 1,
        maxMessages: undefined,
      });
    });

    it('enforces min/max bounds of 1 and 100 on the threshold input', () => {
      render(<WinConditionEditor value={thresholdValue} onChange={() => {}} />);
      const input = screen.getByTestId('win-threshold');
      expect(input).toHaveAttribute('min', '1');
      expect(input).toHaveAttribute('max', '100');
    });
  });

  describe('max-messages cap', () => {
    it('renders an empty cap input when maxMessages is unset', () => {
      render(<WinConditionEditor value={manualValue} onChange={() => {}} />);
      expect(screen.getByTestId('win-max-messages')).toHaveValue(null);
    });

    it('renders the provided cap value', () => {
      render(<WinConditionEditor value={{ type: 'manual', maxMessages: 50 }} onChange={() => {}} />);
      expect(screen.getByTestId('win-max-messages')).toHaveValue(50);
    });

    it('emits the parsed cap on change while preserving the rest of the value', () => {
      const onChange = jest.fn();
      render(<WinConditionEditor value={thresholdValue} onChange={onChange} />);
      fireEvent.change(screen.getByTestId('win-max-messages'), { target: { value: '20' } });
      expect(onChange).toHaveBeenCalledWith({
        type: 'score_threshold',
        threshold: 75,
        maxMessages: 20,
      });
    });

    it('emits maxMessages undefined when the cap input is cleared', () => {
      const onChange = jest.fn();
      render(<WinConditionEditor value={{ type: 'manual', maxMessages: 30 }} onChange={onChange} />);
      fireEvent.change(screen.getByTestId('win-max-messages'), { target: { value: '' } });
      expect(onChange).toHaveBeenCalledWith({ type: 'manual', maxMessages: undefined });
    });

    it('sets the cap on a manual condition without altering its type', () => {
      const onChange = jest.fn();
      render(<WinConditionEditor value={manualValue} onChange={onChange} />);
      fireEvent.change(screen.getByTestId('win-max-messages'), { target: { value: '15' } });
      expect(onChange).toHaveBeenCalledWith({ type: 'manual', maxMessages: 15 });
    });

    it('enforces min/max bounds of 1 and 100 on the cap input', () => {
      render(<WinConditionEditor value={manualValue} onChange={() => {}} />);
      const input = screen.getByTestId('win-max-messages');
      expect(input).toHaveAttribute('min', '1');
      expect(input).toHaveAttribute('max', '100');
    });
  });
});
