import type { User, Persona, Conversation, Message, Summary } from '@prisma/client';

// Re-export Prisma types
export type { User, Persona, Conversation, Message, Summary };

// Also export the new Prisma types
export type { Scenario, UserScenario, Role, SourceFile } from '@prisma/client';

// --- Mood types ---

export const MOOD_STATES = [
  'neutral',
  'firm',
  'skeptical',
  'interested',
  'impressed',
  'frustrated',
  'considering',
] as const;

export type MoodType = typeof MOOD_STATES[number];

export const DEFAULT_MOOD: MoodType = 'neutral';

// --- Scenario types ---

export interface EvaluationFramework {
  name: string;
  description: string;
  elements: Array<{ name: string; description: string }>;
  weight: number;
}

export interface EvaluationCriteria {
  frameworks: EvaluationFramework[];
  scoringInstructions: string;
}

export interface WinCondition {
  type: 'score_threshold' | 'manual';
  threshold?: number;
  maxMessages?: number;
}

export type ScenarioVisibility = 'public' | 'unlisted';
export type ScenarioStatus = 'draft' | 'published' | 'archived';

// --- Persona types ---

export interface PersonaCharacteristics {
  openness: number;
  concerns: string[];
  personality: string[];
  roleBehavior: string;
}

export interface PersonaStatus {
  id: string;
  status: 'available' | 'in_progress' | 'completed';
}

// --- Evaluation types ---

export interface LLMFeedback {
  whatWentWell: string[];
  whatToImprove: string[];
  specificSuggestions: string[];
}

export interface WinningArgument {
  text: string;
  framework: string;
  element: string;
  effectiveness: number;
}

// --- Scenario generation types ---

export interface GeneratedRole {
  name: string;
  description: string;
}

export interface GeneratedScenario {
  title: string;
  description: string;
  userRole: string;       // Legacy: summary of the trainee's role
  aiRole: string;         // Legacy: summary of the AI counterpart's role
  initialGreeting: string;
  evaluationCriteria: EvaluationCriteria;
  winCondition: WinCondition;
  roles: GeneratedRole[];          // Formal role definitions
  personas: GeneratedPersona[];
}

export interface GeneratedPersona {
  name: string;
  description: string;
  roleType: string;
  initialGreeting: string;
  characteristics: PersonaCharacteristics;
}

// --- Extended types with relations ---

export type ConversationWithRelations = Conversation & {
  user: User;
  persona: Persona;
  messages: Message[];
  summary: Summary | null;
};

export type MessageWithConversation = Message & {
  conversation: Conversation;
};

// --- API types ---

export type ConversationStatus = 'in_progress' | 'completed' | 'abandoned';
export type MessageRole = 'user' | 'assistant';

export interface CreateConversationRequest {
  personaId: string;
  scenarioId: string;
}

export interface CreateConversationResponse {
  id: string;
  personaId: string;
  scenarioId: string;
  status: ConversationStatus;
  startedAt: string;
}

export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  userMessage: Message;
  assistantMessage: Message;
  conversationStatus: ConversationStatus;
}

export interface GenerateSummaryResponse {
  summary: Summary;
}

// --- LLM Provider types ---

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  generateResponse(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

// --- Error types ---

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` with id ${id}` : ''} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
