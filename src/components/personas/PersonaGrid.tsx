'use client';

import { PersonaCard } from './PersonaCard';

interface Persona {
  id: string;
  name: string;
  description: string;
  roleType: string;
  [key: string]: unknown;
}

export interface PersonaWithStatus extends Persona {
  status: 'available' | 'in_progress' | 'completed';
  conversationId?: string;
}

interface PersonaGridProps {
  personas: PersonaWithStatus[];
  onPersonaClick: (persona: PersonaWithStatus) => void;
}

export function PersonaGrid({ personas, onPersonaClick }: PersonaGridProps) {
  if (personas.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 dark:text-gray-400 text-lg">
          No personas available yet. Join a scenario to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {personas.map((persona) => (
        <PersonaCard
          key={persona.id}
          persona={persona}
          status={persona.status}
          onClick={() => onPersonaClick(persona)}
        />
      ))}
    </div>
  );
}
