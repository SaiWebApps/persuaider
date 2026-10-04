'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface RunAiVsAiButtonProps {
  scenarioId: string;
  personas: Array<{ id: string; name: string }>;
}

/** "Run AI vs AI": pick a counterpart by name; the run starts and its page opens. */
export function RunAiVsAiButton({ scenarioId, personas }: RunAiVsAiButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState('');

  const start = async (personaId: string) => {
    setStarting(personaId);
    setError('');
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not start the run');
        setStarting(null);
        return;
      }
      router.push(`/run/${data.run.id}`);
    } catch {
      setError('Could not start the run');
      setStarting(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
        data-testid={`run-ai-vs-ai-${scenarioId}`}
      >
        Run AI vs AI
      </button>
      <Modal isOpen={open} onClose={() => { setOpen(false); setError(''); }} title="Run AI vs AI">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Pick the counterpart. The AI plays your side against them while you watch.
          </p>
          {personas.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">This scenario has no counterparts yet.</p>}
          <div className="flex flex-col gap-2">
            {personas.map((p) => (
              <Button key={p.id} variant="secondary" onClick={() => start(p.id)} disabled={starting !== null}>
                {p.name}
              </Button>
            ))}
          </div>
          {starting && <p className="text-sm text-gray-500 dark:text-gray-400">Starting the run…</p>}
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
