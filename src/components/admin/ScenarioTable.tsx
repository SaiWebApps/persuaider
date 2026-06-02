'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { EvaluationEditor } from '@/components/admin/EvaluationEditor';
import { WinConditionEditor } from '@/components/admin/WinConditionEditor';
import { TagsEditor } from '@/components/admin/TagsEditor';
import { SourceDocumentUpload } from '@/components/admin/SourceDocumentUpload';
import { PersonaEditPanel } from '@/components/admin/PersonaEditPanel';
import type { EvaluationCriteria, WinCondition } from '@/types';

interface PersonaSummary {
  id: string;
  name: string;
  roleType: string;
}

interface MemberInfo {
  user: { id: string; email: string; username: string };
}

interface SourceFileInfo {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface ScenarioRow {
  id: string;
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  joinCode: string;
  status: string;
  visibility?: string;
  tags?: string;
  contextNotes?: string | null;
  evaluationCriteria?: string;
  winCondition?: string;
  createdAt: Date;
  personas: PersonaSummary[];
  members: MemberInfo[];
  sourceFiles?: SourceFileInfo[];
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

const defaultEvalCriteria: EvaluationCriteria = {
  frameworks: [],
  scoringInstructions: '',
};

const defaultWinCondition: WinCondition = {
  type: 'manual',
  maxMessages: 30,
};

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
  const [evalCriteria, setEvalCriteria] = useState<EvaluationCriteria>(defaultEvalCriteria);
  const [winCondition, setWinCondition] = useState<WinCondition>(defaultWinCondition);
  const [contextNotes, setContextNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('unlisted');
  // Tracks which existing persona (by id) has its edit panel open in the expanded row.
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit scenario state
  const [editScenarioId, setEditScenarioId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editUserRole, setEditUserRole] = useState('');
  const [editAiRole, setEditAiRole] = useState('');
  const [editEvalCriteria, setEditEvalCriteria] = useState<EvaluationCriteria>(defaultEvalCriteria);
  const [editWinCondition, setEditWinCondition] = useState<WinCondition>(defaultWinCondition);
  const [editContextNotes, setEditContextNotes] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editVisibility, setEditVisibility] = useState<'public' | 'unlisted'>('unlisted');
  const [editSourceFiles, setEditSourceFiles] = useState<SourceFileInfo[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
    setEvalCriteria(defaultEvalCriteria);
    setWinCondition(defaultWinCondition);
    setContextNotes('');
    setTags([]);
    setVisibility('unlisted');
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
          evaluationCriteria: evalCriteria,
          winCondition,
          contextNotes: contextNotes || null,
          tags,
          visibility,
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

  const openEdit = async (scenario: ScenarioRow) => {
    setEditScenarioId(scenario.id);
    setEditTitle(scenario.title);
    setEditDescription(scenario.description);
    setEditUserRole(scenario.userRole);
    setEditAiRole(scenario.aiRole);
    setEditContextNotes(scenario.contextNotes || '');
    setEditVisibility((scenario.visibility as 'public' | 'unlisted') || 'public');
    setEditError(null);

    try {
      const evalStr = scenario.evaluationCriteria || '{}';
      const evalObj = typeof evalStr === 'string' ? JSON.parse(evalStr) : evalStr;
      setEditEvalCriteria(evalObj.frameworks ? evalObj : defaultEvalCriteria);
    } catch {
      setEditEvalCriteria(defaultEvalCriteria);
    }

    try {
      const winStr = scenario.winCondition || '{"type":"manual"}';
      const winObj = typeof winStr === 'string' ? JSON.parse(winStr) : winStr;
      setEditWinCondition(winObj);
    } catch {
      setEditWinCondition(defaultWinCondition);
    }

    try {
      const tagsStr = scenario.tags || '[]';
      const tagsArr = typeof tagsStr === 'string' ? JSON.parse(tagsStr) : tagsStr;
      setEditTags(Array.isArray(tagsArr) ? tagsArr : []);
    } catch {
      setEditTags([]);
    }

    // Load source files
    try {
      const res = await fetch(`/api/admin/scenarios/${scenario.id}/source-files`);
      if (res.ok) {
        const data = await res.json();
        setEditSourceFiles(data.files || []);
      }
    } catch {
      setEditSourceFiles([]);
    }
  };

  const handleEditSave = async () => {
    if (!editScenarioId) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/scenarios/${editScenarioId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          userRole: editUserRole,
          aiRole: editAiRole,
          evaluationCriteria: editEvalCriteria,
          winCondition: editWinCondition,
          contextNotes: editContextNotes || null,
          tags: editTags,
          visibility: editVisibility,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error || 'Failed to save');
        return;
      }
      setEditScenarioId(null);
      router.refresh();
    } catch {
      setEditError('Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditUpload = async (file: File) => {
    if (!editScenarioId) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/admin/scenarios/${editScenarioId}/source-files`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Upload failed');
    }
    const data = await res.json();
    setEditSourceFiles([...editSourceFiles, data.file]);
  };

  const handleEditDeleteFile = async (fileId: string) => {
    if (!editScenarioId) return;
    await fetch(`/api/admin/scenarios/${editScenarioId}/source-files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    });
    setEditSourceFiles(editSourceFiles.filter(f => f.id !== fileId));
  };

  const handleStatusChange = async (scenarioId: string, newStatus: string) => {
    const res = await fetch(`/api/admin/scenarios/${scenarioId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      router.refresh();
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

    for (const uid of assignedUserIds) {
      if (!currentIds.has(uid)) {
        await fetch(`/api/admin/scenarios/${assignScenarioId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid }),
        });
      }
    }

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

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
      published: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
      archived: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const totalSteps = 5;

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setShowCreate(true)} data-testid="create-scenario-btn">
          Create Scenario
        </Button>
      </div>

      <div className="space-y-4">
        {initialScenarios.map((s) => (
          <div key={s.id} className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div
              className="px-6 py-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              data-testid={`scenario-row-${s.id}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{s.title}</h3>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(s.status)}`}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.description.substring(0, 120)}...</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{s.personas.length} personas</span>
                    <span>{s.members.length} users</span>
                    <span>{s._count.conversations} conversations</span>
                    <span>Code: {s.joinCode}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(s); }} data-testid={`edit-btn-${s.id}`}>
                    Edit
                  </Button>
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

                {/* Status actions */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-2">Lifecycle</p>
                  <div className="flex gap-2">
                    {s.status === 'draft' && (
                      <Button size="sm" onClick={() => handleStatusChange(s.id, 'published')} data-testid={`publish-btn-${s.id}`}>
                        Publish
                      </Button>
                    )}
                    {s.status === 'published' && (
                      <Button variant="secondary" size="sm" onClick={() => handleStatusChange(s.id, 'archived')} data-testid={`archive-btn-${s.id}`}>
                        Archive
                      </Button>
                    )}
                    {s.status === 'archived' && (
                      <span className="text-xs text-gray-500 italic">Archived (no further transitions)</span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-2">Personas</p>
                <div className="space-y-2">
                  {s.personas.map(p => (
                    <div key={p.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                        <span className="text-gray-500 dark:text-gray-400">({p.roleType})</span>
                        <button
                          type="button"
                          onClick={() => setEditingPersonaId(editingPersonaId === p.id ? null : p.id)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                          data-testid={`edit-persona-${p.id}`}
                        >
                          {editingPersonaId === p.id ? 'Close' : 'Edit'}
                        </button>
                      </div>
                      {editingPersonaId === p.id && (
                        <PersonaEditPanel personaId={p.id} personaName={p.name} />
                      )}
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
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); resetCreateForm(); }}
        title={`Create Scenario - Step ${step} of ${totalSteps}`}
      >
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
              <p className="text-sm text-gray-600 dark:text-gray-400">Add personas for the AI to roleplay.</p>
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
                    <textarea name="personaDescription" value={p.description} onChange={e => updatePersona(i, 'description', e.target.value)} rows={2} placeholder="Describe personality..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" />
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
            <div className="space-y-4 max-h-96 overflow-y-auto">
              <EvaluationEditor value={evalCriteria} onChange={setEvalCriteria} />
              <WinConditionEditor value={winCondition} onChange={setWinCondition} />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Context Notes</label>
                <textarea
                  value={contextNotes}
                  onChange={e => setContextNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional constraints or context for this scenario..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                  data-testid="create-context-notes"
                />
              </div>
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(4)}>Next</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <TagsEditor value={tags} onChange={setTags} />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Visibility</label>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as 'public' | 'unlisted')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                  data-testid="create-visibility"
                >
                  <option value="unlisted">Unlisted (join code only)</option>
                  <option value="public">Public (discoverable)</option>
                </select>
              </div>
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(3)}>Back</Button>
                <Button onClick={() => setStep(5)}>Next</Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Review your scenario:</p>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
                <p className="text-sm"><strong>Title:</strong> {title}</p>
                <p className="text-sm"><strong>Trainee:</strong> {userRole}</p>
                <p className="text-sm"><strong>AI:</strong> {aiRole}</p>
                <p className="text-sm"><strong>Personas:</strong> {newPersonas.filter(p => p.name.trim()).map(p => p.name).join(', ')}</p>
                <p className="text-sm"><strong>Frameworks:</strong> {evalCriteria.frameworks.length} defined</p>
                <p className="text-sm"><strong>Win:</strong> {winCondition.type === 'manual' ? 'Manual' : `Score >= ${winCondition.threshold}`}</p>
                <p className="text-sm"><strong>Tags:</strong> {tags.length > 0 ? tags.join(', ') : 'None'}</p>
                <p className="text-sm"><strong>Visibility:</strong> {visibility}</p>
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(4)}>Back</Button>
                <Button onClick={handleCreate} disabled={creating} data-testid="create-submit">
                  {creating ? 'Creating...' : 'Create Scenario'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Scenario Modal */}
      <Modal
        isOpen={!!editScenarioId}
        onClose={() => setEditScenarioId(null)}
        title="Edit Scenario"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <Input label="Title" name="editTitle" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Trainee Role" name="editUserRole" value={editUserRole} onChange={e => setEditUserRole(e.target.value)} />
            <Input label="AI Role" name="editAiRole" value={editAiRole} onChange={e => setEditAiRole(e.target.value)} />
          </div>

          <EvaluationEditor value={editEvalCriteria} onChange={setEditEvalCriteria} />
          <WinConditionEditor value={editWinCondition} onChange={setEditWinCondition} />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Context Notes</label>
            <textarea
              value={editContextNotes}
              onChange={e => setEditContextNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              data-testid="edit-context-notes"
            />
          </div>

          <TagsEditor value={editTags} onChange={setEditTags} />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Visibility</label>
            <select
              value={editVisibility}
              onChange={e => setEditVisibility(e.target.value as 'public' | 'unlisted')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              data-testid="edit-visibility"
            >
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </div>

          <SourceDocumentUpload
            scenarioId={editScenarioId || undefined}
            files={editSourceFiles}
            onUpload={handleEditUpload}
            onDelete={handleEditDeleteFile}
          />

          {editError && <p className="text-sm text-red-600">{editError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditScenarioId(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving} data-testid="edit-save">
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
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

