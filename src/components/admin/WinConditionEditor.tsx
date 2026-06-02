'use client';

import type { WinCondition } from '@/types';

interface Props {
  value: WinCondition;
  onChange: (val: WinCondition) => void;
}

export function WinConditionEditor({ value, onChange }: Props) {
  return (
    <div data-testid="win-condition-editor" className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Win Condition
      </h4>

      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name="winConditionType"
            value="manual"
            checked={value.type === 'manual'}
            onChange={() => onChange({ type: 'manual', maxMessages: value.maxMessages })}
            className="text-indigo-600"
            data-testid="win-type-manual"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Manual</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Conversation ends when the user clicks &quot;End Conversation&quot;
            </p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name="winConditionType"
            value="score_threshold"
            checked={value.type === 'score_threshold'}
            onChange={() => onChange({ type: 'score_threshold', threshold: 75, maxMessages: value.maxMessages })}
            className="text-indigo-600"
            data-testid="win-type-threshold"
          />
          <div>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Score Threshold</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Auto-evaluate when the trainee reaches the threshold score
            </p>
          </div>
        </label>
      </div>

      {value.type === 'score_threshold' && (
        <div className="pl-8">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Score Threshold (1-100)
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={value.threshold || 75}
            onChange={(e) => onChange({ ...value, threshold: parseInt(e.target.value) || 1 })}
            className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            data-testid="win-threshold"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Max Messages (1-100, optional)
        </label>
        <input
          type="number"
          min="1"
          max="100"
          value={value.maxMessages || ''}
          onChange={(e) => {
            const val = e.target.value ? parseInt(e.target.value) : undefined;
            onChange({ ...value, maxMessages: val });
          }}
          placeholder="30"
          className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
          data-testid="win-max-messages"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Conversation auto-ends after this many messages. Leave empty for unlimited.
        </p>
      </div>
    </div>
  );
}

