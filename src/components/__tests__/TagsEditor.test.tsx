/**
 * @jest-environment jsdom
 */

import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { TagsEditor } from '@/components/admin/TagsEditor';

// The component is controlled: it never mutates `value` itself, it only calls
// onChange. A stateful harness lets us exercise flows that depend on `value`
// actually changing (add then add again, remove, max-limit, dedupe).
function Harness({
  initial = [],
  maxTags,
  maxLength,
  onChangeSpy,
}: {
  initial?: string[];
  maxTags?: number;
  maxLength?: number;
  onChangeSpy?: (val: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <TagsEditor
      value={value}
      onChange={(val) => {
        onChangeSpy?.(val);
        setValue(val);
      }}
      maxTags={maxTags}
      maxLength={maxLength}
    />
  );
}

describe('TagsEditor', () => {
  describe('rendering', () => {
    it('renders the editor container and input', () => {
      render(<TagsEditor value={[]} onChange={jest.fn()} />);
      expect(screen.getByTestId('tags-editor')).toBeInTheDocument();
      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(screen.getByTestId('add-tag')).toBeInTheDocument();
    });

    it('renders existing tags as pills with remove buttons', () => {
      render(<TagsEditor value={['alpha', 'beta']} onChange={jest.fn()} />);
      expect(screen.getByTestId('tag-pill-0')).toHaveTextContent('alpha');
      expect(screen.getByTestId('tag-pill-1')).toHaveTextContent('beta');
      expect(screen.getByTestId('remove-tag-0')).toBeInTheDocument();
      expect(screen.getByTestId('remove-tag-1')).toBeInTheDocument();
    });

    it('shows the tag count using the default maxTags of 10', () => {
      render(<TagsEditor value={['one', 'two']} onChange={jest.fn()} />);
      expect(screen.getByText('2/10 tags')).toBeInTheDocument();
    });

    it('reflects a custom maxTags in the count display', () => {
      render(<TagsEditor value={['one']} onChange={jest.fn()} maxTags={3} />);
      expect(screen.getByText('1/3 tags')).toBeInTheDocument();
    });

    it('does not render an error message initially', () => {
      render(<TagsEditor value={[]} onChange={jest.fn()} />);
      expect(screen.queryByTestId('tag-error')).not.toBeInTheDocument();
    });
  });

  describe('adding tags', () => {
    it('adds a tag when the Add button is clicked', () => {
      const onChange = jest.fn();
      render(<Harness onChangeSpy={onChange} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'newtag' } });
      fireEvent.click(screen.getByTestId('add-tag'));

      expect(onChange).toHaveBeenCalledWith(['newtag']);
      expect(screen.getByTestId('tag-pill-0')).toHaveTextContent('newtag');
    });

    it('adds a tag when Enter is pressed in the input', () => {
      const onChange = jest.fn();
      render(<Harness onChangeSpy={onChange} />);

      const input = screen.getByTestId('tag-input');
      fireEvent.change(input, { target: { value: 'viakey' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['viakey']);
      expect(screen.getByTestId('tag-pill-0')).toHaveTextContent('viakey');
    });

    it('trims surrounding whitespace from the added tag', () => {
      const onChange = jest.fn();
      render(<Harness onChangeSpy={onChange} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: '  spaced  ' } });
      fireEvent.click(screen.getByTestId('add-tag'));

      expect(onChange).toHaveBeenCalledWith(['spaced']);
    });

    it('appends to existing tags preserving order (onChange shape)', () => {
      const onChange = jest.fn();
      render(<Harness initial={['first']} onChangeSpy={onChange} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'second' } });
      fireEvent.click(screen.getByTestId('add-tag'));

      expect(onChange).toHaveBeenCalledWith(['first', 'second']);
      expect(Array.isArray(onChange.mock.calls[0][0])).toBe(true);
    });

    it('clears the input after a successful add', () => {
      render(<Harness />);

      const input = screen.getByTestId('tag-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'clearme' } });
      fireEvent.click(screen.getByTestId('add-tag'));

      expect(input.value).toBe('');
    });

    it('does not call onChange for an Enter press on an empty input', () => {
      const onChange = jest.fn();
      render(<TagsEditor value={[]} onChange={onChange} />);

      fireEvent.keyDown(screen.getByTestId('tag-input'), { key: 'Enter' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('ignores non-Enter key presses', () => {
      const onChange = jest.fn();
      render(<TagsEditor value={[]} onChange={onChange} />);

      const input = screen.getByTestId('tag-input');
      fireEvent.change(input, { target: { value: 'notyet' } });
      fireEvent.keyDown(input, { key: 'a' });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('rejecting invalid tags', () => {
    it('rejects an empty/whitespace-only tag without calling onChange', () => {
      const onChange = jest.fn();
      render(<TagsEditor value={[]} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: '   ' } });
      // Button is disabled for whitespace-only, so drive via Enter to hit addTag().
      fireEvent.keyDown(screen.getByTestId('tag-input'), { key: 'Enter' });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByTestId('tag-error')).not.toBeInTheDocument();
    });

    it('rejects a case-insensitive duplicate tag and shows an error', () => {
      const onChange = jest.fn();
      render(<TagsEditor value={['React']} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'react' } });
      fireEvent.click(screen.getByTestId('add-tag'));

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('tag-error')).toHaveTextContent('Duplicate tag');
    });

    it('rejects an exact duplicate tag', () => {
      const onChange = jest.fn();
      render(<TagsEditor value={['exact']} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'exact' } });
      fireEvent.click(screen.getByTestId('add-tag'));

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('tag-error')).toHaveTextContent('Duplicate tag');
    });

    it('rejects a tag longer than maxLength and reports the limit', () => {
      const onChange = jest.fn();
      render(<TagsEditor value={[]} onChange={onChange} maxLength={5} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'toolong' } });
      fireEvent.keyDown(screen.getByTestId('tag-input'), { key: 'Enter' });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('tag-error')).toHaveTextContent('Tag must be at most 5 characters');
    });

    it('clears a prior error after a subsequent valid add', () => {
      render(<Harness initial={['dup']} />);

      // First trigger a duplicate error.
      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'dup' } });
      fireEvent.click(screen.getByTestId('add-tag'));
      expect(screen.getByTestId('tag-error')).toHaveTextContent('Duplicate tag');

      // Then add a valid tag — the error should be cleared.
      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'fresh' } });
      fireEvent.click(screen.getByTestId('add-tag'));

      expect(screen.queryByTestId('tag-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('tag-pill-1')).toHaveTextContent('fresh');
    });
  });

  describe('removing tags', () => {
    it('removes the targeted tag and calls onChange with the remaining tags', () => {
      const onChange = jest.fn();
      render(<Harness initial={['a', 'b', 'c']} onChangeSpy={onChange} />);

      fireEvent.click(screen.getByTestId('remove-tag-1'));

      expect(onChange).toHaveBeenCalledWith(['a', 'c']);
      expect(screen.queryByText('b')).not.toBeInTheDocument();
      expect(screen.getByTestId('tag-pill-0')).toHaveTextContent('a');
      expect(screen.getByTestId('tag-pill-1')).toHaveTextContent('c');
    });

    it('removes the first tag correctly', () => {
      const onChange = jest.fn();
      render(<Harness initial={['x', 'y']} onChangeSpy={onChange} />);

      fireEvent.click(screen.getByTestId('remove-tag-0'));

      expect(onChange).toHaveBeenCalledWith(['y']);
    });

    it('removing the only tag yields an empty array', () => {
      const onChange = jest.fn();
      render(<Harness initial={['solo']} onChangeSpy={onChange} />);

      fireEvent.click(screen.getByTestId('remove-tag-0'));

      expect(onChange).toHaveBeenCalledWith([]);
      expect(screen.queryByTestId('tag-pill-0')).not.toBeInTheDocument();
    });
  });

  describe('max-limit enforcement', () => {
    it('disables the Add button when at the max tag limit', () => {
      render(<TagsEditor value={['a', 'b']} onChange={jest.fn()} maxTags={2} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'overflow' } });
      expect(screen.getByTestId('add-tag')).toBeDisabled();
    });

    it('rejects adding past the max limit via Enter and shows the limit error', () => {
      const onChange = jest.fn();
      render(<TagsEditor value={['a', 'b']} onChange={onChange} maxTags={2} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'third' } });
      fireEvent.keyDown(screen.getByTestId('tag-input'), { key: 'Enter' });

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByTestId('tag-error')).toHaveTextContent('Maximum 2 tags allowed');
    });

    it('disables the Add button when input is empty even below the limit', () => {
      render(<TagsEditor value={[]} onChange={jest.fn()} maxTags={5} />);
      expect(screen.getByTestId('add-tag')).toBeDisabled();
    });

    it('allows adding right up to the limit', () => {
      const onChange = jest.fn();
      render(<Harness initial={['a']} maxTags={2} onChangeSpy={onChange} />);

      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'b' } });
      fireEvent.click(screen.getByTestId('add-tag'));

      expect(onChange).toHaveBeenCalledWith(['a', 'b']);
      expect(screen.getByText('2/2 tags')).toBeInTheDocument();
      // Now at the limit, the Add button should be disabled even with input.
      fireEvent.change(screen.getByTestId('tag-input'), { target: { value: 'c' } });
      expect(screen.getByTestId('add-tag')).toBeDisabled();
    });
  });
});
