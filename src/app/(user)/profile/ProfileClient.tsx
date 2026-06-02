'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

interface ProfileClientProps {
  initialUsername: string;
  email: string;
  stats: {
    totalConversations: number;
    completedConversations: number;
    averageScore: number;
    completionRate: number;
  };
}

export function ProfileClient({ initialUsername, email, stats }: ProfileClientProps) {
  const [username, setUsername] = useState(initialUsername);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(initialUsername);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update');
        return;
      }
      setUsername(data.username);
      setEditMode(false);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-indigo-600">Profile</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/history"
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              History
            </Link>
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-300 dark:border-gray-600 rounded-md"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Account Info</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">Email</label>
              <p className="text-gray-900 dark:text-gray-100" data-testid="profile-email">{email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">Username</label>
              {editMode ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    data-testid="username-input"
                  />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    data-testid="save-button"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditMode(false); setDraft(username); setError(null); }}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-gray-900 dark:text-gray-100" data-testid="profile-username">{username}</p>
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                    data-testid="edit-button"
                  >
                    Edit
                  </button>
                </div>
              )}
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-1" data-testid="error-message">{error}</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Your Stats</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-indigo-600" data-testid="stat-total">{stats.totalConversations}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Conversations</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-green-600" data-testid="stat-completed">{stats.completedConversations}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Completed</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-purple-600" data-testid="stat-score">{stats.averageScore}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Average Score</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-amber-600" data-testid="stat-rate">{stats.completionRate}%</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Completion Rate</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
