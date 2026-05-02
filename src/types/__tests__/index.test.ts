import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
} from '../index';
import type {
  EvaluationCriteria,
  WinCondition,
  PersonaCharacteristics,
  LLMFeedback,
  WinningArgument,
  GeneratedScenario,
  GeneratedPersona,
  GeneratedRole,
  CreateConversationRequest,
  SendMessageRequest,
  LLMMessage,
  LLMResponse,
  LLMOptions,
  PersonaStatus,
  ConversationStatus,
  MessageRole,
  ScenarioVisibility,
  ScenarioStatus,
} from '../index';

describe('Custom error classes', () => {
  describe('ValidationError', () => {
    it('creates with message and field', () => {
      const error = new ValidationError('Invalid email', 'email');
      expect(error.message).toBe('Invalid email');
      expect(error.field).toBe('email');
      expect(error.name).toBe('ValidationError');
    });

    it('creates without field', () => {
      const error = new ValidationError('Something invalid');
      expect(error.field).toBeUndefined();
    });

    it('is an instance of Error', () => {
      const error = new ValidationError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  describe('AuthenticationError', () => {
    it('creates with message', () => {
      const error = new AuthenticationError('Not authenticated');
      expect(error.message).toBe('Not authenticated');
      expect(error.name).toBe('AuthenticationError');
    });

    it('is an instance of Error', () => {
      expect(new AuthenticationError('test')).toBeInstanceOf(Error);
    });
  });

  describe('AuthorizationError', () => {
    it('creates with message', () => {
      const error = new AuthorizationError('Not authorized');
      expect(error.message).toBe('Not authorized');
      expect(error.name).toBe('AuthorizationError');
    });
  });

  describe('NotFoundError', () => {
    it('creates with resource and id', () => {
      const error = new NotFoundError('User', '123');
      expect(error.message).toBe('User with id 123 not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('creates with resource only', () => {
      const error = new NotFoundError('Conversation');
      expect(error.message).toBe('Conversation not found');
    });
  });

  describe('ConflictError', () => {
    it('creates with message', () => {
      const error = new ConflictError('Already exists');
      expect(error.message).toBe('Already exists');
      expect(error.name).toBe('ConflictError');
    });
  });
});

describe('Type shapes (compile-time validation)', () => {
  // These tests verify that the TypeScript interfaces accept the expected shapes.
  // They run at both compile time (TS) and runtime (Jest).

  it('EvaluationCriteria matches expected shape', () => {
    const criteria: EvaluationCriteria = {
      frameworks: [
        {
          name: 'Communication',
          description: 'How well arguments are communicated',
          elements: [{ name: 'Clarity', description: 'Clear arguments' }],
          weight: 0.4,
        },
      ],
      scoringInstructions: 'Score 1-10 per element.',
    };
    expect(criteria.frameworks).toHaveLength(1);
    expect(criteria.frameworks[0].elements).toHaveLength(1);
    expect(criteria.frameworks[0].weight).toBe(0.4);
  });

  it('WinCondition accepts score_threshold type', () => {
    const condition: WinCondition = {
      type: 'score_threshold',
      threshold: 80,
      maxMessages: 30,
    };
    expect(condition.type).toBe('score_threshold');
    expect(condition.threshold).toBe(80);
  });

  it('WinCondition accepts manual type', () => {
    const condition: WinCondition = {
      type: 'manual',
      maxMessages: 20,
    };
    expect(condition.type).toBe('manual');
    expect(condition.threshold).toBeUndefined();
  });

  it('PersonaCharacteristics matches expected shape', () => {
    const chars: PersonaCharacteristics = {
      openness: 4,
      concerns: ['budget', 'equity'],
      personality: ['data-driven', 'fair'],
      roleBehavior: 'Listens and asks for evidence.',
    };
    expect(chars.openness).toBe(4);
    expect(chars.concerns).toHaveLength(2);
  });

  it('LLMFeedback matches expected shape', () => {
    const feedback: LLMFeedback = {
      whatWentWell: ['Good preparation'],
      whatToImprove: ['Be more assertive'],
      specificSuggestions: ['Use BATNA reference'],
    };
    expect(feedback.whatWentWell).toHaveLength(1);
  });

  it('WinningArgument matches expected shape', () => {
    const arg: WinningArgument = {
      text: 'Market rate is higher',
      framework: 'Preparation',
      element: 'Market awareness',
      effectiveness: 8,
    };
    expect(arg.effectiveness).toBe(8);
  });

  it('GeneratedPersona matches expected shape', () => {
    const persona: GeneratedPersona = {
      name: 'Alex',
      description: 'A manager',
      roleType: 'Manager',
      initialGreeting: 'Hello.',
      characteristics: {
        openness: 3,
        concerns: ['budget'],
        personality: ['direct'],
        roleBehavior: 'Challenges arguments.',
      },
    };
    expect(persona.characteristics.openness).toBe(3);
  });

  it('GeneratedScenario matches expected shape', () => {
    const scenario: GeneratedScenario = {
      title: 'Salary Negotiation',
      description: 'Negotiate a raise.',
      userRole: 'Employee',
      aiRole: 'Manager',
      initialGreeting: 'Welcome.',
      evaluationCriteria: {
        frameworks: [],
        scoringInstructions: '',
      },
      winCondition: { type: 'manual' },
      personas: [],
    };
    expect(scenario.personas).toHaveLength(0);
  });

  it('CreateConversationRequest requires personaId and scenarioId', () => {
    const req: CreateConversationRequest = {
      personaId: 'p1',
      scenarioId: 's1',
    };
    expect(req.personaId).toBe('p1');
    expect(req.scenarioId).toBe('s1');
  });

  it('SendMessageRequest requires content', () => {
    const req: SendMessageRequest = { content: 'Hello' };
    expect(req.content).toBe('Hello');
  });

  it('LLMMessage role is union of system/user/assistant', () => {
    const msgs: LLMMessage[] = [
      { role: 'system', content: 'You are...' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];
    expect(msgs).toHaveLength(3);
  });

  it('LLMResponse has required content and optional usage', () => {
    const r1: LLMResponse = { content: 'response' };
    expect(r1.usage).toBeUndefined();

    const r2: LLMResponse = {
      content: 'response',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
    expect(r2.usage?.totalTokens).toBe(30);
  });

  it('LLMOptions fields are all optional', () => {
    const opts: LLMOptions = {};
    expect(opts.temperature).toBeUndefined();

    const opts2: LLMOptions = { temperature: 0.7, maxTokens: 500, model: 'gpt-4' };
    expect(opts2.temperature).toBe(0.7);
  });

  it('PersonaStatus has expected values', () => {
    const statuses: PersonaStatus[] = [
      { id: '1', status: 'available' },
      { id: '2', status: 'in_progress' },
      { id: '3', status: 'completed' },
    ];
    expect(statuses).toHaveLength(3);
  });

  it('ConversationStatus type accepts valid values', () => {
    const statuses: ConversationStatus[] = ['in_progress', 'completed', 'abandoned'];
    expect(statuses).toContain('in_progress');
  });

  it('MessageRole type accepts valid values', () => {
    const roles: MessageRole[] = ['user', 'assistant'];
    expect(roles).toHaveLength(2);
  });

  it('ScenarioVisibility type accepts valid values', () => {
    const vis: ScenarioVisibility[] = ['public', 'unlisted'];
    expect(vis).toHaveLength(2);
  });

  it('GeneratedRole matches expected shape', () => {
    const role: GeneratedRole = {
      name: 'Buyer for TechCorp',
      description: 'You are the VP of Corporate Development at TechCorp, looking to acquire a startup.',
    };
    expect(role.name).toBe('Buyer for TechCorp');
    expect(role.description).toContain('VP of Corporate Development');
  });

  it('GeneratedScenario includes roles array', () => {
    const scenario: GeneratedScenario = {
      title: 'Acquisition Negotiation',
      description: 'A two-party acquisition scenario.',
      userRole: 'Buyer',
      aiRole: 'Seller',
      initialGreeting: 'Welcome.',
      evaluationCriteria: {
        frameworks: [],
        scoringInstructions: '',
      },
      winCondition: { type: 'manual' },
      roles: [
        { name: 'Buyer', description: 'Acquiring company representative' },
        { name: 'Seller', description: 'Startup founder being acquired' },
      ],
      personas: [],
    };
    expect(scenario.roles).toHaveLength(2);
    expect(scenario.roles[0].name).toBe('Buyer');
    expect(scenario.roles[1].name).toBe('Seller');
  });

  it('GeneratedScenario works with empty roles for backward compat', () => {
    const scenario: GeneratedScenario = {
      title: 'Salary Negotiation',
      description: 'Negotiate a raise.',
      userRole: 'Employee',
      aiRole: 'Manager',
      initialGreeting: 'Welcome.',
      evaluationCriteria: {
        frameworks: [],
        scoringInstructions: '',
      },
      winCondition: { type: 'manual' },
      roles: [],
      personas: [],
    };
    expect(scenario.roles).toHaveLength(0);
  });

  it('ScenarioStatus type accepts valid values', () => {
    const statuses: ScenarioStatus[] = ['draft', 'published', 'archived'];
    expect(statuses).toHaveLength(3);
  });
});
