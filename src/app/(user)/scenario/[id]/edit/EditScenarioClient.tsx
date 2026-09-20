'use client';

import { useState } from 'react';
import { CopyShareLink } from '@/components/scenarios/CopyShareLink';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { IssueNumbersEditor, issueZone } from '@/components/scenarios/IssueNumbersEditor';
import type { GeneratedIssue } from '@/types';

interface EditableScenario {
  id: string;
  title: string;
  description: string;
  visibility: 'public' | 'unlisted';
  joinCode: string;
  learnerRoleId: string | null;
  roles: Array<{ id: string; name: string; description: string }>;
  personas: Array<{ id: string; name: string; roleId: string | null }>;
  issues: GeneratedIssue[];
}

export function EditScenarioClient({ scenario }: { scenario: EditableScenario }) {
  const router = useRouter();
  const [title, setTitle] = useState(scenario.title);
  const [description, setDescription] = useState(scenario.description);
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>(scenario.visibility);
  const [roles, setRoles] = useState(scenario.roles);
  const [learnerRoleId, setLearnerRoleId] = useState(scenario.learnerRoleId);
  const [issues, setIssues] = useState(scenario.issues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const invalidIssue = issues.find((i) => !issueZone(i).ok);
  const playedByPersona = (roleId: string) => scenario.personas.some((p) => p.roleId === roleId);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/scenarios/${scenario.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, visibility, roles, learnerRoleId, issues }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not save');
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError('Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 shadow-sm px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-indigo-600">Edit scenario</h1>
        <Link href="/dashboard" className="text-sm text-gray-700 dark:text-gray-300">Back to Dashboard</Link>
      </nav>
      <main className="max-w-3xl mx-auto p-6 space-y-6" data-testid="edit-scenario">
        {error && <p role="alert" data-testid="edit-error" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
        {saved && <p role="status" data-testid="edit-saved" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-950/40 dark:text-green-200">Saved.</p>}

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="edit-title" className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} data-testid="edit-description" className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Visibility</legend>
            <div className="mt-1 flex gap-4 text-sm text-gray-800 dark:text-gray-200">
              <label className="flex items-center gap-2"><input type="radio" name="visibility" checked={visibility === 'unlisted'} onChange={() => setVisibility('unlisted')} data-testid="visibility-unlisted" /> Unlisted (join code {scenario.joinCode})</label>
              <label className="flex items-center gap-2"><input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => setVisibility('public')} data-testid="visibility-public" /> Public (on Explore; anyone can copy your briefs and numbers)</label>
            </div>
          </fieldset>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Send this scenario to someone: <CopyShareLink joinCode={scenario.joinCode} testId="share-link" />
          </p>
        </section>

        {roles.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4" data-testid="edit-sides">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Sides and confidential briefs</h2>
            {roles.map((role, idx) => (
              <div key={role.id} className="border border-gray-200 dark:border-gray-700 rounded-md p-4 space-y-2" data-testid={`side-${idx}`}>
                <div className="flex items-center gap-3">
                  <input value={role.name} onChange={(e) => setRoles(roles.map((r) => (r.id === role.id ? { ...r, name: e.target.value } : r)))} data-testid={`side-${idx}-name`} className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                  <label className={`flex items-center gap-2 text-sm ${playedByPersona(role.id) ? 'text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
                    <input type="radio" name="learnerRole" checked={learnerRoleId === role.id} disabled={playedByPersona(role.id)} onChange={() => setLearnerRoleId(role.id)} data-testid={`side-${idx}-learner`} />
                    you play this side{playedByPersona(role.id) ? ' (a persona plays it)' : ''}
                  </label>
                </div>
                <textarea value={role.description} onChange={(e) => setRoles(roles.map((r) => (r.id === role.id ? { ...r, description: e.target.value } : r)))} rows={4} data-testid={`side-${idx}-brief`} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm" />
              </div>
            ))}
          </section>
        )}

        {issues.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-3" data-testid="edit-numbers">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Numbers</h2>
            <IssueNumbersEditor issues={issues} onChange={setIssues} />
          </section>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving || !!invalidIssue} data-testid="edit-save">{saving ? 'Saving…' : 'Save'}</Button>
          {invalidIssue && <span className="text-sm text-amber-700 dark:text-amber-300">Fix the numbers on “{invalidIssue.name}” first.</span>}
        </div>
      </main>
    </div>
  );
}
