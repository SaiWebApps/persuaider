'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { EvaluationCriteria, EvaluationFramework } from '@/types';

interface Props {
  value: EvaluationCriteria;
  onChange: (val: EvaluationCriteria) => void;
}

const emptyFramework: EvaluationFramework = {
  name: '',
  description: '',
  elements: [{ name: '', description: '' }],
  weight: 50,
};

export function EvaluationEditor({ value, onChange }: Props) {
  const [expandedFramework, setExpandedFramework] = useState<number | null>(
    value.frameworks.length > 0 ? 0 : null
  );

  const addFramework = () => {
    onChange({
      ...value,
      frameworks: [...value.frameworks, { ...emptyFramework, elements: [{ name: '', description: '' }] }],
    });
    setExpandedFramework(value.frameworks.length);
  };

  const removeFramework = (index: number) => {
    const updated = value.frameworks.filter((_, i) => i !== index);
    onChange({ ...value, frameworks: updated });
    if (expandedFramework === index) setExpandedFramework(null);
    else if (expandedFramework !== null && expandedFramework > index) {
      setExpandedFramework(expandedFramework - 1);
    }
  };

  const updateFramework = (index: number, field: keyof EvaluationFramework, fieldValue: unknown) => {
    const updated = [...value.frameworks];
    updated[index] = { ...updated[index], [field]: fieldValue };
    onChange({ ...value, frameworks: updated });
  };

  const addElement = (fwIndex: number) => {
    const updated = [...value.frameworks];
    updated[fwIndex] = {
      ...updated[fwIndex],
      elements: [...updated[fwIndex].elements, { name: '', description: '' }],
    };
    onChange({ ...value, frameworks: updated });
  };

  const removeElement = (fwIndex: number, elIndex: number) => {
    const updated = [...value.frameworks];
    updated[fwIndex] = {
      ...updated[fwIndex],
      elements: updated[fwIndex].elements.filter((_, i) => i !== elIndex),
    };
    onChange({ ...value, frameworks: updated });
  };

  const updateElement = (fwIndex: number, elIndex: number, field: 'name' | 'description', fieldValue: string) => {
    const updated = [...value.frameworks];
    const elements = [...updated[fwIndex].elements];
    elements[elIndex] = { ...elements[elIndex], [field]: fieldValue };
    updated[fwIndex] = { ...updated[fwIndex], elements };
    onChange({ ...value, frameworks: updated });
  };

  return (
    <div data-testid="evaluation-editor" className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Evaluation Frameworks
        </h4>
        <Button variant="secondary" size="sm" onClick={addFramework} data-testid="add-framework">
          Add Framework
        </Button>
      </div>

      {value.frameworks.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          No frameworks defined. Add one to set evaluation criteria.
        </p>
      )}

      <div className="space-y-3">
        {value.frameworks.map((fw, fwIdx) => (
          <div
            key={fwIdx}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            data-testid={`framework-${fwIdx}`}
          >
            <div
              className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 cursor-pointer"
              onClick={() => setExpandedFramework(expandedFramework === fwIdx ? null : fwIdx)}
            >
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {fw.name || `Framework ${fwIdx + 1}`}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Weight: {fw.weight}%
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFramework(fwIdx); }}
                  className="text-red-500 hover:text-red-700 text-xs"
                  data-testid={`remove-framework-${fwIdx}`}
                >
                  Remove
                </button>
              </div>
            </div>

            {expandedFramework === fwIdx && (
              <div className="px-4 py-3 space-y-3 border-t border-gray-200 dark:border-gray-700">
                <Input
                  label="Framework Name"
                  name={`fw-name-${fwIdx}`}
                  value={fw.name}
                  onChange={(e) => updateFramework(fwIdx, 'name', e.target.value)}
                  placeholder="e.g. Negotiation Tactics"
                  data-testid={`fw-name-${fwIdx}`}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={fw.description}
                    onChange={(e) => updateFramework(fwIdx, 'description', e.target.value)}
                    rows={2}
                    placeholder="Describe what this framework evaluates..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    data-testid={`fw-desc-${fwIdx}`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Weight: {fw.weight}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={fw.weight}
                    onChange={(e) => updateFramework(fwIdx, 'weight', parseInt(e.target.value))}
                    className="w-full"
                    data-testid={`fw-weight-${fwIdx}`}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                      Elements ({fw.elements.length})
                    </span>
                    <button
                      onClick={() => addElement(fwIdx)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                      data-testid={`add-element-${fwIdx}`}
                    >
                      + Add Element
                    </button>
                  </div>
                  {fw.elements.map((el, elIdx) => (
                    <div
                      key={elIdx}
                      className="flex gap-2 items-start"
                      data-testid={`element-${fwIdx}-${elIdx}`}
                    >
                      <div className="flex-1 space-y-1">
                        <input
                          type="text"
                          value={el.name}
                          onChange={(e) => updateElement(fwIdx, elIdx, 'name', e.target.value)}
                          placeholder="Element name"
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          data-testid={`el-name-${fwIdx}-${elIdx}`}
                        />
                        <input
                          type="text"
                          value={el.description}
                          onChange={(e) => updateElement(fwIdx, elIdx, 'description', e.target.value)}
                          placeholder="Element description"
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          data-testid={`el-desc-${fwIdx}-${elIdx}`}
                        />
                      </div>
                      {fw.elements.length > 1 && (
                        <button
                          onClick={() => removeElement(fwIdx, elIdx)}
                          className="text-red-500 hover:text-red-700 text-xs mt-1"
                          data-testid={`remove-element-${fwIdx}-${elIdx}`}
                        >
                          X
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Scoring Instructions
        </label>
        <textarea
          value={value.scoringInstructions || ''}
          onChange={(e) => onChange({ ...value, scoringInstructions: e.target.value })}
          rows={3}
          placeholder="Instructions for how the AI should score conversations against these frameworks..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
          data-testid="scoring-instructions"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {(value.scoringInstructions || '').length}/2000 characters
        </p>
      </div>
    </div>
  );
}

