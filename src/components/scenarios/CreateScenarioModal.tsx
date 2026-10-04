'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

interface CreateScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY_PERSONA = { name: '', description: '', roleType: '' };

/** The dashboard's hand-written "Create Scenario" form. */
export function CreateScenarioModal({ isOpen, onClose, onCreated }: CreateScenarioModalProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUserRole, setNewUserRole] = useState('');
  const [newAiRole, setNewAiRole] = useState('');
  const [newPersonas, setNewPersonas] = useState([EMPTY_PERSONA]);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newAccessCode, setNewAccessCode] = useState('');

  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          userRole: newUserRole,
          aiRole: newAiRole,
          accessCode: newAccessCode.trim() || null,
          personas: newPersonas.filter(p => p.name.trim()),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || 'Failed to create');
        return;
      }
      setNewTitle('');
      setNewDescription('');
      setNewUserRole('');
      setNewAiRole('');
      setNewPersonas([EMPTY_PERSONA]);
      setNewAccessCode('');
      onCreated();
    } catch {
      setCreateError('Failed to create scenario');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Scenario">
      <div className="space-y-4">
        <Input label="Title" name="title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Contract Negotiation" />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea name="description" value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={2} placeholder="Describe the scenario..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" />
        </div>
        <Input label="Your Role" name="userRole" value={newUserRole} onChange={e => setNewUserRole(e.target.value)} placeholder="e.g. Sales representative" />
        <Input label="AI's Role" name="aiRole" value={newAiRole} onChange={e => setNewAiRole(e.target.value)} placeholder="e.g. Skeptical buyer" />
        <Input label="Access Code (optional)" name="accessCode" value={newAccessCode} onChange={e => setNewAccessCode(e.target.value)} placeholder="Leave blank for open access" />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Personas</label>
          {newPersonas.map((p, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={p.name} onChange={e => { const u = [...newPersonas]; u[i] = { ...u[i], name: e.target.value }; setNewPersonas(u); }}
                placeholder="Name" className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
              <input value={p.roleType} onChange={e => { const u = [...newPersonas]; u[i] = { ...u[i], roleType: e.target.value }; setNewPersonas(u); }}
                placeholder="Role type" className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
              {newPersonas.length > 1 && (
                <button onClick={() => setNewPersonas(newPersonas.filter((_, j) => j !== i))} className="text-red-500 text-sm">Remove</button>
              )}
            </div>
          ))}
          <button onClick={() => setNewPersonas([...newPersonas, EMPTY_PERSONA])} className="text-sm text-indigo-600 hover:text-indigo-500">+ Add persona</button>
        </div>

        {createError && <p className="text-sm text-red-600">{createError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating || !newTitle.trim() || !newDescription.trim() || !newUserRole.trim() || !newAiRole.trim()}>
            {creating ? 'Creating...' : 'Create Scenario'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
