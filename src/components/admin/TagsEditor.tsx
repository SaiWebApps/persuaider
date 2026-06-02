'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

interface Props {
  value: string[];
  onChange: (val: string[]) => void;
  maxTags?: number;
  maxLength?: number;
}

export function TagsEditor({ value, onChange, maxTags = 10, maxLength = 50 }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addTag = () => {
    const tag = input.trim();
    setError(null);

    if (!tag) return;

    if (tag.length > maxLength) {
      setError(`Tag must be at most ${maxLength} characters`);
      return;
    }

    if (value.length >= maxTags) {
      setError(`Maximum ${maxTags} tags allowed`);
      return;
    }

    if (value.some(t => t.toLowerCase() === tag.toLowerCase())) {
      setError('Duplicate tag');
      return;
    }

    onChange([...value, tag]);
    setInput('');
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div data-testid="tags-editor" className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Tags
      </h4>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag..."
          maxLength={maxLength}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
          data-testid="tag-input"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={addTag}
          disabled={!input.trim() || value.length >= maxTags}
          data-testid="add-tag"
        >
          Add
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" data-testid="tag-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {value.map((tag, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 rounded-full"
            data-testid={`tag-pill-${idx}`}
          >
            {tag}
            <button
              onClick={() => removeTag(idx)}
              className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200"
              data-testid={`remove-tag-${idx}`}
            >
              x
            </button>
          </span>
        ))}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {value.length}/{maxTags} tags
      </p>
    </div>
  );
}

