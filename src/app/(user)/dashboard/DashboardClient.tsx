'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PersonaGrid, type PersonaWithStatus } from '@/components/personas/PersonaGrid';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';

interface ScenarioWithPersonas {
  id: string;
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  personas: PersonaWithStatus[];
}

interface DashboardClientProps {
  scenarios: ScenarioWithPersonas[];
}

export function DashboardClient({ scenarios: initialScenarios }: DashboardClientProps) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState(initialScenarios);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  // Create scenario state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUserRole, setNewUserRole] = useState('');
  const [newAiRole, setNewAiRole] = useState('');
  const [newPersonas, setNewPersonas] = useState([{ name: '', description: '', roleType: '' }]);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newAccessCode, setNewAccessCode] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    id: string; title: string; description: string; userRole: string; aiRole: string;
    joinCode: string; isRestricted: boolean; personaCount: number; memberCount: number; alreadyJoined: boolean;
  }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  // Access code prompt for restricted scenarios
  const [accessCodePrompt, setAccessCodePrompt] = useState<{ joinCode: string; title: string } | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');

  // Poll for status updates every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 3000);

    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    setScenarios(initialScenarios);
  }, [initialScenarios]);

  const handlePersonaClick = (persona: PersonaWithStatus) => {
    if (persona.status === 'completed') {
      router.push(`/persona/${persona.id}/summary`);
    } else {
      router.push(`/persona/${persona.id}/chat`);
    }
  };

  const handleJoin = async (code?: string, accessCodeValue?: string) => {
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch('/api/scenarios/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode: code || joinCode, accessCode: accessCodeValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresAccessCode) {
          setAccessCodePrompt({ joinCode: code || joinCode, title: 'This scenario requires an access code' });
          setShowJoinModal(false);
          return;
        }
        setJoinError(data.error || 'Failed to join');
        return;
      }
      setShowJoinModal(false);
      setJoinCode('');
      setAccessCodePrompt(null);
      setAccessCodeInput('');
      router.refresh();
    } catch {
      setJoinError('Failed to join scenario');
    } finally {
      setJoining(false);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    setSearchDone(false);
    try {
      const res = await fetch(`/api/scenarios/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      setSearchResults(data.scenarios || []);
      setSearchDone(true);
    } catch {
      setSearchResults([]);
      setSearchDone(true);
    } finally {
      setSearching(false);
    }
  };

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
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewUserRole('');
      setNewAiRole('');
      setNewPersonas([{ name: '', description: '', roleType: '' }]);
      setNewAccessCode('');
      router.refresh();
    } catch {
      setCreateError('Failed to create scenario');
    } finally {
      setCreating(false);
    }
  };

  const allPersonas = scenarios.flatMap((s) => s.personas);

  return (
    <div>
      {/* Action buttons */}
      <div className="flex gap-3 mb-6">
        <Button onClick={() => setShowCreateModal(true)}>Create Scenario</Button>
        <Button variant="secondary" onClick={() => setShowJoinModal(true)}>Join by Code</Button>
      </div>

      {/* Search scenarios */}
      <div className="mb-8">
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search scenarios... (e.g. salary negotiation, sales pitch, conflict resolution)"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <Button onClick={handleSearch} disabled={searching || searchQuery.trim().length < 2}>
            {searching ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {searchDone && (
          <div className="mt-4">
            {searchResults.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No scenarios found for &quot;{searchQuery}&quot;</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">{searchResults.length} scenario{searchResults.length !== 1 ? 's' : ''} found</p>
                {searchResults.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{s.title}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.description.substring(0, 100)}{s.description.length > 100 ? '...' : ''}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>{s.personaCount} personas</span>
                        <span>{s.memberCount} members</span>
                        {s.isRestricted && <span className="text-amber-600 dark:text-amber-400">Restricted access</span>}
                      </div>
                    </div>
                    <div className="ml-4">
                      {s.alreadyJoined ? (
                        <span className="text-sm text-green-600 dark:text-green-400 font-medium">Joined</span>
                      ) : (
                        <Button size="sm" onClick={() => {
                          if (s.isRestricted) {
                            setAccessCodePrompt({ joinCode: s.joinCode, title: s.title });
                          } else {
                            handleJoin(s.joinCode);
                          }
                        }}>Join</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Scenario sections */}
      <div className="space-y-8">
        {scenarios.map((scenario) => (
          <section key={scenario.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Scenario header */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{scenario.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{scenario.description}</p>
              <div className="flex gap-4 mt-2">
                <span className="inline-flex items-center text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 px-2 py-1 rounded-full font-medium">
                  Your role: {scenario.userRole}
                </span>
                <span className="inline-flex items-center text-xs text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-2 py-1 rounded-full font-medium">
                  AI role: {scenario.aiRole}
                </span>
              </div>
            </div>

            {/* Personas grid */}
            <div className="p-6">
              <PersonaGrid personas={scenario.personas} onPersonaClick={handlePersonaClick} />
            </div>
          </section>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Available</p>
          <p className="text-2xl font-bold text-green-600">
            {allPersonas.filter((p) => p.status === 'available').length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">In Progress</p>
          <p className="text-2xl font-bold text-yellow-600">
            {allPersonas.filter((p) => p.status === 'in_progress').length}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Completed</p>
          <p className="text-2xl font-bold text-blue-600">
            {allPersonas.filter((p) => p.status === 'completed').length}
          </p>
        </div>
      </div>

      {/* Join by Code Modal */}
      <Modal isOpen={showJoinModal} onClose={() => { setShowJoinModal(false); setJoinCode(''); setJoinError(''); }} title="Join Scenario">
        <div className="space-y-4">
          <Input
            label="Join Code"
            name="joinCode"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="e.g. AIADOPT1"
          />
          {joinError && <p className="text-sm text-red-600">{joinError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowJoinModal(false)}>Cancel</Button>
            <Button onClick={() => handleJoin()} disabled={joining || !joinCode.trim()}>
              {joining ? 'Joining...' : 'Join'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Scenario Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Scenario">
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
            <button onClick={() => setNewPersonas([...newPersonas, { name: '', description: '', roleType: '' }])} className="text-sm text-indigo-600 hover:text-indigo-500">+ Add persona</button>
          </div>

          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newTitle.trim() || !newDescription.trim() || !newUserRole.trim() || !newAiRole.trim()}>
              {creating ? 'Creating...' : 'Create Scenario'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Access Code Prompt Modal */}
      <Modal isOpen={!!accessCodePrompt} onClose={() => { setAccessCodePrompt(null); setAccessCodeInput(''); }} title="Access Code Required">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <strong>{accessCodePrompt?.title}</strong> requires an access code to join.
          </p>
          <Input
            label="Access Code"
            name="accessCode"
            type="password"
            value={accessCodeInput}
            onChange={e => setAccessCodeInput(e.target.value)}
            placeholder="Enter access code"
          />
          {joinError && <p className="text-sm text-red-600">{joinError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setAccessCodePrompt(null); setAccessCodeInput(''); }}>Cancel</Button>
            <Button onClick={() => handleJoin(accessCodePrompt!.joinCode, accessCodeInput)} disabled={joining || !accessCodeInput.trim()}>
              {joining ? 'Joining...' : 'Join'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
