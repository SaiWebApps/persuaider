'use client';

import { useState, useCallback } from 'react';
import type { PersonaCharacteristics } from '@/types';

interface PersonaCharacteristicsEditorProps {
  value: PersonaCharacteristics | null;
  onChange: (val: PersonaCharacteristics) => void;
}

const DEFAULT_CHARACTERISTICS: PersonaCharacteristics = {
  openness: 0.5,
  concerns: [],
  personality: [],
  roleBehavior: '',
};

const MAX_CONCERNS = 20;
const MAX_PERSONALITY_TAGS = 10;
const MAX_ROLE_BEHAVIOR_LENGTH = 1000;

export function PersonaCharacteristicsEditor({
  value,
  onChange,
}: PersonaCharacteristicsEditorProps) {
  const characteristics = value || DEFAULT_CHARACTERISTICS;
  const [concernInput, setConcernInput] = useState('');
  const [personalityInput, setPersonalityInput] = useState('');

  const handleOpennessChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const openness = parseFloat(e.target.value);
      onChange({ ...characteristics, openness });
    },
    [characteristics, onChange]
  );

  const handleAddConcern = useCallback(() => {
    const trimmed = concernInput.trim();
    if (!trimmed) return;
    if (characteristics.concerns.length >= MAX_CONCERNS) return;
    if (characteristics.concerns.includes(trimmed)) return;
    onChange({ ...characteristics, concerns: [...characteristics.concerns, trimmed] });
    setConcernInput('');
  }, [concernInput, characteristics, onChange]);

  const handleRemoveConcern = useCallback(
    (index: number) => {
      const updated = characteristics.concerns.filter((_, i) => i !== index);
      onChange({ ...characteristics, concerns: updated });
    },
    [characteristics, onChange]
  );

  const handleConcernKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); handleAddConcern(); }
    },
    [handleAddConcern]
  );

  const handleAddPersonality = useCallback(() => {
    const trimmed = personalityInput.trim();
    if (!trimmed) return;
    if (characteristics.personality.length >= MAX_PERSONALITY_TAGS) return;
    if (characteristics.personality.includes(trimmed)) return;
    onChange({ ...characteristics, personality: [...characteristics.personality, trimmed] });
    setPersonalityInput('');
  }, [personalityInput, characteristics, onChange]);

  const handleRemovePersonality = useCallback(
    (index: number) => {
      const updated = characteristics.personality.filter((_, i) => i !== index);
      onChange({ ...characteristics, personality: updated });
    },
    [characteristics, onChange]
  );

  const handlePersonalityKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); handleAddPersonality(); }
    },
    [handleAddPersonality]
  );

  const handleRoleBehaviorChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const roleBehavior = e.target.value.slice(0, MAX_ROLE_BEHAVIOR_LENGTH);
      onChange({ ...characteristics, roleBehavior });
    },
    [characteristics, onChange]
  );

  return (
    <div data-testid="persona-characteristics-editor" className="space-y-6">
      <div>
        <label htmlFor="openness-slider" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Openness: {characteristics.openness.toFixed(1)}
        </label>
        <input id="openness-slider" type="range" min="0" max="1" step="0.1" value={characteristics.openness} onChange={handleOpennessChange} className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" data-testid="openness-slider" />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1"><span>Closed</span><span>Open</span></div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Concerns ({characteristics.concerns.length}/{MAX_CONCERNS})</label>
        <div className="flex gap-2 mb-2">
          <input type="text" value={concernInput} onChange={(e) => setConcernInput(e.target.value)} onKeyDown={handleConcernKeyDown} placeholder="Add a concern..." className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" disabled={characteristics.concerns.length >= MAX_CONCERNS} data-testid="concern-input" />
          <button type="button" onClick={handleAddConcern} disabled={!concernInput.trim() || characteristics.concerns.length >= MAX_CONCERNS} className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50" data-testid="add-concern-button">Add</button>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="concerns-list">
          {characteristics.concerns.map((concern, index) => (<span key={index} className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm rounded-full">{concern}<button type="button" onClick={() => handleRemoveConcern(index)} className="text-gray-500 hover:text-red-600">x</button></span>))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Personality ({characteristics.personality.length}/{MAX_PERSONALITY_TAGS})</label>
        <div className="flex gap-2 mb-2">
          <input type="text" value={personalityInput} onChange={(e) => setPersonalityInput(e.target.value)} onKeyDown={handlePersonalityKeyDown} placeholder="Add a trait..." className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" disabled={characteristics.personality.length >= MAX_PERSONALITY_TAGS} data-testid="personality-input" />
          <button type="button" onClick={handleAddPersonality} disabled={!personalityInput.trim() || characteristics.personality.length >= MAX_PERSONALITY_TAGS} className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50" data-testid="add-personality-button">Add</button>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="personality-list">
          {characteristics.personality.map((trait, index) => (<span key={index} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 text-sm rounded-full">{trait}<button type="button" onClick={() => handleRemovePersonality(index)} className="text-indigo-500 hover:text-red-600">x</button></span>))}
        </div>
      </div>
      <div>
        <label htmlFor="role-behavior" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Role Behavior ({characteristics.roleBehavior.length}/{MAX_ROLE_BEHAVIOR_LENGTH})</label>
        <textarea id="role-behavior" value={characteristics.roleBehavior} onChange={handleRoleBehaviorChange} placeholder="Describe how this persona should behave in their role..." rows={4} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-y" maxLength={MAX_ROLE_BEHAVIOR_LENGTH} data-testid="role-behavior-textarea" />
      </div>
    </div>
  );
}
