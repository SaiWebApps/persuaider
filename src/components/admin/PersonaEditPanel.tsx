'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PersonaCharacteristics } from '@/types';
import { PersonaCharacteristicsEditor } from '@/components/admin/PersonaCharacteristicsEditor';
import { PersonaAvatarUpload } from '@/components/personas/PersonaAvatarUpload';

interface PersonaEditPanelProps {
  personaId: string;
  personaName: string;
}

/**
 * Admin panel for editing an existing persona's characteristics and avatar.
 * Mounted on demand from the scenario editor's persona list. Fetches the
 * persona's current state on open, then persists changes via PATCH /api/personas/[id].
 */
export function PersonaEditPanel({ personaId, personaName }: PersonaEditPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [characteristics, setCharacteristics] = useState<PersonaCharacteristics | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/personas/${personaId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load persona (${res.status})`);
        }
        const { persona } = await res.json();
        if (cancelled) return;
        // characteristics is stored as a JSON string; parse it defensively.
        let parsed: PersonaCharacteristics | null = null;
        if (persona.characteristics) {
          try {
            parsed = JSON.parse(persona.characteristics) as PersonaCharacteristics;
          } catch {
            parsed = null;
          }
        }
        setCharacteristics(parsed);
        setAvatarUrl(persona.avatarUrl ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load persona');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personaId]);

  const handleCharacteristicsChange = useCallback((val: PersonaCharacteristics) => {
    setCharacteristics(val);
    setSaved(false);
  }, []);

  const handleSaveCharacteristics = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/personas/${personaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characteristics }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save characteristics');
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save characteristics');
    } finally {
      setSaving(false);
    }
  }, [personaId, characteristics]);

  const handleAvatarChange = useCallback((url: string | null) => {
    setAvatarUrl(url);
  }, []);

  if (loading) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="persona-edit-loading">
        Loading persona…
      </p>
    );
  }

  return (
    <div
      data-testid="persona-edit-panel"
      className="mt-3 space-y-6 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4"
    >
      <PersonaAvatarUpload
        personaId={personaId}
        personaName={personaName}
        currentAvatarUrl={avatarUrl}
        onAvatarChange={handleAvatarChange}
      />

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Characteristics</p>
        <PersonaCharacteristicsEditor value={characteristics} onChange={handleCharacteristicsChange} />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveCharacteristics}
            disabled={saving}
            className="px-3 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
            data-testid="save-characteristics-button"
          >
            {saving ? 'Saving…' : 'Save characteristics'}
          </button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400" data-testid="persona-edit-saved">
              Saved
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" data-testid="persona-edit-error">
          {error}
        </p>
      )}
    </div>
  );
}
