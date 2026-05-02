'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

interface PersonaSummary {
  id: string;
  name: string;
  roleType: string;
}

interface MemberInfo {
  user: { id: string; email: string; username: string };
}

interface ScenarioRow {
  id: string;
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  joinCode: string;
  status: string;
  createdAt: Date;
  personas: PersonaSummary[];
  members: MemberInfo[];
  _count: { conversations: number };
}

interface UserOption {
  id: string;
  email: string;
  username: string;
}

interface NewPersona {
  name: string;
  description: string;
  roleType: string;
  initialGreeting: string;
}

export function ScenarioTableClient({
  initialScenarios,
  allUsers,
}: {
  initialScenarios: ScenarioRow[];
  allUsers: UserOption[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Create scenario state
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [userRole, setUserRole] = useState('');
  const [aiRole, setAiRole] = useState('');
  const [newPersonas, setNewPersonas] = useState<NewPersona[]>([
    { name: '', description: '', roleType: '', initialGreeting: '' },
  ]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Assign users state
  const [assignScenarioId, setAssignScenarioId] = useState<string | null>(null);
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const resetCreateForm = () => {
    setStep(1);
    setTitle('');
    setDescription('');
    setUserRole('');
    setAiRole('');
    setNewPersonas([{ name: '', description: '', roleType: '', initialGreeting: '' }]);
    setCreateError(null);
  };

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/admin/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          userRole,
          aiRole,
          personas: newPersonas.filter(p => p.name.trim()),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error || 'Failed to create scenario');
        return;
      }
      setShowCreate(false);
      resetCreateForm();
      router.refresh();
    } catch {
      setCreateError('Failed to create scenario');
    } finally {
      setCreating(false);
    }
  };

  const openAssign = (scenario: ScenarioRow) => {
    setAssignScenarioId(scenario.id);
    setAssignedUserIds(new Set(scenario.members.map(m => m.user.id)));
  };

  const handleSaveAssignments = async () => {
    if (!assignScenarioId) return;
    setSaving(true);
    const scenario = initialScenarios.find(s => s.id === assignScenarioId);
    if (!scenario) return;

    const currentIds = new Set(scenario.members.map(m => m.user.id));

    // Add new assignments
    for (const uid of assignedUserIds) {
      if (!currentIds.has(uid)) {
        await fetch(`/api/admin/scenarios/${assignScenarioId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid }),
        });
      }
    }

    // Remove unassigned
    for (const uid of currentIds) {
      if (!assignedUserIds.has(uid)) {
        await fetch(`/api/admin/scenarios/${assignScenarioId}/assign`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid }),
        });
      }
    }

    setSaving(false);
    setAssignScenarioId(null);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scenario and all its data?')) return;
    await fetch(`/api/admin/scenarios/${id}`, { method: 'DELETE' });
    router.refresh();
  };

  const addPersonaRow = () => {
    setNewPersonas([...newPersonas, { name: '', description: '', roleType: '', initialGreeting: '' }]);
  };

  const updatePersona = (index: number, field: keyof NewPersona, value: string) => {
    const updated = [...newPersonas];
    updated[index] = { ...updated[index], [field]: value };
    setNewPersonas(updated);
  };

  const removePersona = (index: number) => {
    if (newPersonas.length <= 1) return;
    setNewPersonas(newPersonas.filter((_, i) => i !== index));
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setShowCreate(true)}>Create Scenario</Button>
      </div>

      <div className="space-y-4">
        {initialScenarios.map((s) => (
          <div key={s.id} className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div
              className="px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{s.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.description.substring(0, 120)}...</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{s.personas.length} personas</span>
                    <span>{s.members.length} users</span>
                    <span>{s._count.conversations} conversations</span>
                    <span>Code: {s.joinCode}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); openAssign(s); }}>
                    Assign Users
                  </Button>
                  <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>

            {expanded === s.id && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">User Role</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{s.userRole}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">AI Role</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">{s.aiRole}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-2">Personas</p>
                <div className="space-y-2">
                  {s.personas.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                      <span className="text-gray-500 dark:text-gray-400">({p.roleType})</span>
                    </div>
                  ))}
                </div>
                {s.members.length > 0 && (
                  <>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-2 mt-4">Assigned Users</p>
                    <div className="flex flex-wrap gap-2">
                      {s.members.map(m => (
                        <span key={m.user.id} className="inline-flex px-2 py-1 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 rounded-full">
                          {m.user.username}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Scenario Modal */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); resetCreateForm(); }} title={`Create Scenario — Step ${step} of 3`}>
        <div>
          {step === 1 && (
            <div className="space-y-4">
              <Input label="Title" name="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Contract Negotiation" />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea name="description" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Describe the scenario..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
              </div>
              <Input label="Trainee's Role" name="userRole" value={userRole} onChange={e => setUserRole(e.target.value)} placeholder="e.g. Sales representative" />
              <Input label="AI's Role" name="aiRole" value={aiRole} onChange={e => setAiRole(e.target.value)} placeholder="e.g. Skeptical buyer" />
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!title || !description || !userRole || !aiRole}>Next</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Add personas for the AI to roleplay. Each persona should have a distinct personality.</p>
              {newPersonas.map((p, i) => (
                <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Persona {i + 1}</span>
                    {newPersonas.length > 1 && (
                      <button onClick={() => removePersona(i)} className="text-xs text-red-600 hover:text-red-800">Remove</button>
                    )}
                  </div>
                  <Input label="Name" name="personaName" value={p.name} onChange={e => updatePersona(i, 'name', e.target.value)} placeholder="e.g. Jordan the Tough Buyer" />
                  <Input label="Role Type" name="personaRoleType" value={p.roleType} onChange={e => updatePersona(i, 'roleType', e.target.value)} placeholder="e.g. Skeptical buyer" />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                    <textarea name="personaDescription" value={p.description} onChange={e => updatePersona(i, 'description', e.target.value)} rows={2} placeholder="Describe personality and concerns..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" />
                  </div>
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={addPersonaRow}>Add Persona</Button>
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)} disabled={!newPersonas.some(p => p.name.trim())}>Next</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Review your scenario:</p>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
                <p className="text-sm"><strong>Title:</strong> {title}</p>
                <p className="text-sm"><strong>Trainee:</strong> {userRole}</p>
                <p className="text-sm"><strong>AI:</strong> {aiRole}</p>
                <p className="text-sm"><strong>Personas:</strong> {newPersonas.filter(p => p.name.trim()).map(p => p.name).join(', ')}</p>
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creating...' : 'Create Scenario'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Assign Users Modal */}
      <Modal isOpen={!!assignScenarioId} onClose={() => setAssignScenarioId(null)} title="Assign Users">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Select users who should have access to this scenario:</p>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {allUsers.map(u => (
              <label key={u.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                <input
                  type="checkbox"
                  data-user={u.email}
                  checked={assignedUserIds.has(u.id)}
                  onChange={() => {
                    const next = new Set(assignedUserIds);
                    if (next.has(u.id)) next.delete(u.id);
                    else next.add(u.id);
                    setAssignedUserIds(next);
                  }}
                  className="rounded border-gray-300"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.username}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAssignScenarioId(null)}>Cancel</Button>
            <Button onClick={handleSaveAssignments} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
