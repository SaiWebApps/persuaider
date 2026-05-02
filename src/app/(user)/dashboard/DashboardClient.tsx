'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PersonaGrid, type PersonaWithStatus } from '@/components/personas/PersonaGrid';

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

  if (scenarios.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 dark:text-gray-400 text-lg">
          No scenarios joined yet. Join a scenario to get started.
        </div>
      </div>
    );
  }

  const allPersonas = scenarios.flatMap((s) => s.personas);

  return (
    <div>
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
    </div>
  );
}
