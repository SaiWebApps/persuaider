import type { Prisma } from '@prisma/client';

/**
 * The one shape of Persona and Scenario that reaches the persona prompt.
 *
 * Every turn path (non-streaming, streaming, and later the simulation engine)
 * selects exactly this, so what the model can "see" is defined in one place
 * rather than drifting per route.
 */

export const personaPromptSelect = {
  name: true,
  description: true,
  roleType: true,
  characteristics: true,
  role: { select: { name: true, description: true } },
} satisfies Prisma.PersonaSelect;

export const scenarioPromptSelect = {
  title: true,
  description: true,
  userRole: true,
  aiRole: true,
  contextNotes: true,
  evaluationCriteria: true,
  issues: true,
} satisfies Prisma.ScenarioSelect;

export type PersonaForPrompt = Prisma.PersonaGetPayload<{ select: typeof personaPromptSelect }>;
export type ScenarioForPrompt = Prisma.ScenarioGetPayload<{ select: typeof scenarioPromptSelect }>;
