'use client';

import { useState, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FileUpload } from '@/components/ui/FileUpload';
import type { GeneratedScenario } from '@/types';
import { IssueNumbersEditor } from '@/components/scenarios/IssueNumbersEditor';

interface GenerateScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolves to null on success, or an error message to show inside the modal. */
  onSave: (scenario: GeneratedScenario) => Promise<string | null> | void;
}

type TabType = 'describe' | 'upload';

export function GenerateScenarioModal({ isOpen, onClose, onSave }: GenerateScenarioModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('describe');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedScenario, setGeneratedScenario] = useState<GeneratedScenario | null>(null);

  const handleGenerate = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      let response: Response;

      if (activeTab === 'describe') {
        response = await fetch('/api/scenarios/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        });
      } else {
        if (!selectedFile) {
          setError('Please select a file to upload');
          setIsLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', selectedFile);
        response = await fetch('/api/scenarios/generate-from-document', {
          method: 'POST',
          body: formData,
        });
      }

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Generation failed');
        setIsLoading(false);
        return;
      }

      setGeneratedScenario(data.scenario);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, description, selectedFile]);

  const handleReset = useCallback(() => {
    setDescription('');
    setSelectedFile(null);
    setError(null);
    setGeneratedScenario(null);
    setIsLoading(false);
  }, []);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const handleSave = useCallback(async () => {
    if (!generatedScenario) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await onSave(generatedScenario);
      if (typeof result === 'string') {
        setSaveError(result); // keep the preview and the author's edits
        return;
      }
      handleReset();
    } catch {
      setSaveError('Could not save the scenario. Your edits are still here.');
    } finally {
      setSaving(false);
    }
  }, [generatedScenario, onSave, handleReset]);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [onClose, handleReset]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (generatedScenario) {
      setGeneratedScenario({ ...generatedScenario, title: e.target.value });
    }
  }, [generatedScenario]);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (generatedScenario) {
      setGeneratedScenario({ ...generatedScenario, description: e.target.value });
    }
  }, [generatedScenario]);

  const handleUserRoleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (generatedScenario) {
      setGeneratedScenario({ ...generatedScenario, userRole: e.target.value });
    }
  }, [generatedScenario]);

  const handleAiRoleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (generatedScenario) {
      setGeneratedScenario({ ...generatedScenario, aiRole: e.target.value });
    }
  }, [generatedScenario]);

  const isGenerateDisabled = activeTab === 'describe' ? description.trim().length === 0 : !selectedFile;

  if (generatedScenario) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Review Generated Scenario"
        footer={
          <>
            <Button onClick={handleReset} data-testid="back-button">
              Back
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-button">
              {saving ? 'Saving…' : 'Save Scenario'}
            </Button>
          </>
        }
      >
        <div className="space-y-4" data-testid="scenario-preview">
          {saveError && (
            <p role="alert" data-testid="save-error" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
              {saveError}
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={generatedScenario.title}
              onChange={handleTitleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              data-testid="edit-title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={generatedScenario.description}
              onChange={handleDescriptionChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              data-testid="edit-description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Your Role
            </label>
            <input
              type="text"
              value={generatedScenario.userRole}
              onChange={handleUserRoleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              data-testid="edit-user-role"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              AI Role
            </label>
            <input
              type="text"
              value={generatedScenario.aiRole}
              onChange={handleAiRoleChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              data-testid="edit-ai-role"
            />
          </div>
          {(generatedScenario.roles ?? []).length > 0 && (
            <div data-testid="sides-preview">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sides {generatedScenario.learnerRoleName ? `(you play: ${generatedScenario.learnerRoleName})` : ''}
              </label>
              <div className="space-y-2">
                {generatedScenario.roles.map((role, idx) => (
                  <div key={idx} className="p-2 border border-gray-200 dark:border-gray-600 rounded text-sm" data-testid={'side-' + idx}>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{role.name}</span>
                    {role.name === generatedScenario.learnerRoleName && <span className="ml-2 text-xs text-indigo-700 dark:text-indigo-300">you</span>}
                    <p className="text-gray-600 dark:text-gray-400 mt-1">{role.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(generatedScenario.issues ?? []).length > 0 && (
            <div data-testid="issues-preview">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Numbers (confirm or edit; the counterpart never sees yours, you never see theirs during play)
              </label>
              <IssueNumbersEditor issues={generatedScenario.issues} onChange={(issues) => setGeneratedScenario({ ...generatedScenario, issues })} />
            </div>
          )}
          {generatedScenario.personas.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Personas ({generatedScenario.personas.length})
              </label>
              <div className="space-y-2">
                {generatedScenario.personas.map((persona, idx) => (
                  <div
                    key={idx}
                    className="p-2 border border-gray-200 dark:border-gray-600 rounded text-sm"
                    data-testid={'persona-' + idx}
                  >
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {persona.name}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 ml-2">
                      ({persona.roleType}{persona.roleName ? ` · plays ${persona.roleName}` : ''})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Generate Scenario with AI"
      footer={
        <Button
          onClick={handleGenerate}
          disabled={isGenerateDisabled || isLoading}
          data-testid="generate-button"
        >
          {isLoading ? 'Generating...' : 'Generate'}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Tab toggle */}
        <div className="flex border-b border-gray-200 dark:border-gray-700" data-testid="tab-bar">
          <button
            type="button"
            onClick={() => setActiveTab('describe')}
            className={
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors ' +
              (activeTab === 'describe'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400')
            }
            data-testid="tab-describe"
          >
            Describe
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors ' +
              (activeTab === 'upload'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400')
            }
            data-testid="tab-upload"
          >
            Upload Document
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'describe' ? (
          <div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your negotiation scenario..."
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none"
              data-testid="description-input"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Minimum 10 characters. Describe the negotiation situation, roles, and goals.
            </p>
          </div>
        ) : (
          <div>
            <FileUpload
              onFileSelect={(file) => setSelectedFile(file)}
              onError={(err) => setError(err)}
              accept="application/pdf,image/jpeg,image/png,image/webp"
              maxSizeMB={10}
            />
            {selectedFile && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2" data-testid="file-name">
                Selected: {selectedFile.name}
              </p>
            )}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-4" data-testid="loading-state">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mr-2" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Generating scenario...
            </span>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div
            className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md"
            data-testid="error-message"
          >
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
