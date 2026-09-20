import { buildPersonaPrompt, buildConversationContext } from '../prompts';
import { MOOD_STATES } from '@/types';

const basePersona = {
  name: 'Alex Chen',
  description: 'A hiring manager at a tech company',
  roleType: 'Hiring Manager',
};

const baseScenario = {
  title: 'Salary Negotiation',
  description: 'Negotiate your starting salary for a new role.',
  userRole: 'Job Candidate',
  aiRole: 'Hiring Manager',
  evaluationCriteria: JSON.stringify({
    frameworks: [
      {
        name: 'Preparation',
        description: 'How well the candidate prepared',
        elements: [
          { name: 'Market Research', description: 'Cited salary data' },
          { name: 'BATNA', description: 'Mentioned alternatives' },
        ],
      },
    ],
    scoringInstructions: 'Score each element 1-10.',
  }),
};

describe('buildPersonaPrompt', () => {
  it('includes persona name and role', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('Alex Chen');
    expect(prompt).toContain('Hiring Manager');
  });

  it('includes scenario title and description', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('Salary Negotiation');
    expect(prompt).toContain('Negotiate your starting salary');
  });

  it('includes user and AI roles from scenario', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('Your role: Hiring Manager');
    expect(prompt).toContain("The trainee's role: Job Candidate");
  });

  it('parses and includes evaluation framework names', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('Preparation');
    expect(prompt).toContain('How well the candidate prepared');
  });

  it('includes scoring instructions from evaluationCriteria', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('Score each element 1-10.');
  });

  it('parses persona characteristics from JSON string', () => {
    const persona = {
      ...basePersona,
      characteristics: JSON.stringify({
        openness: 3,
        concerns: ['budget constraints', 'team equity'],
        personality: ['data-driven', 'fair-minded'],
        roleBehavior: 'Asks for evidence and data.',
      }),
    };
    const prompt = buildPersonaPrompt(persona, baseScenario);
    expect(prompt).toContain('budget constraints');
    expect(prompt).toContain('team equity');
    expect(prompt).toContain('data-driven');
    expect(prompt).toContain('fair-minded');
    expect(prompt).toContain('Asks for evidence and data.');
  });

  it('handles null characteristics gracefully', () => {
    const persona = { ...basePersona, characteristics: null };
    const prompt = buildPersonaPrompt(persona, baseScenario);
    expect(prompt).toContain('General concerns relevant to your role');
    expect(prompt).toContain('Professional and realistic');
  });

  it('handles undefined characteristics gracefully', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('General concerns relevant to your role');
  });

  it('handles invalid JSON in characteristics', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('General concerns relevant to your role');
  });

  it('handles invalid JSON in evaluationCriteria', () => {
    const scenario = { ...baseScenario, evaluationCriteria: 'not json' };
    const prompt = buildPersonaPrompt(basePersona, scenario);
    expect(prompt).toContain('Preparation');
    expect(prompt).toContain('Deal-making');
  });

  it('handles empty evaluationCriteria JSON', () => {
    const scenario = { ...baseScenario, evaluationCriteria: '{}' };
    const prompt = buildPersonaPrompt(basePersona, scenario);
    expect(prompt).toContain('Preparation');
    expect(prompt).toContain('Deal-making');
  });

  it('includes conversation guidelines', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('Stay in character');
    expect(prompt).toContain('Keep replies under 120 words');
    expect(prompt).toContain('Push back on weak arguments');
  });

  it('includes mood response format instruction', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('"mood"');
    expect(prompt).toContain('"content"');
    expect(prompt).toContain('Response Format');
  });

  it('includes all mood state names in the prompt', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    for (const mood of MOOD_STATES) {
      expect(prompt).toContain(`"${mood}"`);
    }
  });

  it('does not include role behavior line when roleBehavior is empty', () => {
    const persona = {
      ...basePersona,
      characteristics: JSON.stringify({ roleBehavior: '' }),
    };
    const prompt = buildPersonaPrompt(persona, baseScenario);
    expect(prompt).not.toContain('Role Behavior:');
  });
});

describe('buildConversationContext', () => {
  it('returns system message as first element', () => {
    const result = buildConversationContext(basePersona, []);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('Alex Chen');
  });

  it('uses default scenario when none provided', () => {
    const result = buildConversationContext(basePersona, []);
    expect(result[0].content).toContain('Negotiation Training');
    expect(result[0].content).toContain('A general negotiation scenario');
  });

  it('uses provided scenario', () => {
    const result = buildConversationContext(basePersona, [], baseScenario);
    expect(result[0].content).toContain('Salary Negotiation');
  });

  it('appends messages after system message', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'I want a raise' },
    ];
    const result = buildConversationContext(basePersona, messages);
    expect(result).toHaveLength(4);
    expect(result[1]).toEqual({ role: 'user', content: 'Hello' });
    expect(result[2]).toEqual({ role: 'assistant', content: 'Hi there' });
    expect(result[3]).toEqual({ role: 'user', content: 'I want a raise' });
  });

  it('preserves message order', () => {
    const messages = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
      { role: 'assistant', content: 'Fourth' },
    ];
    const result = buildConversationContext(basePersona, messages);
    for (let i = 0; i < messages.length; i++) {
      expect(result[i + 1].content).toBe(messages[i].content);
    }
  });

  it('returns only system message when no messages provided', () => {
    const result = buildConversationContext(basePersona, []);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('system');
  });
});

describe('buildPersonaPrompt: everything the author wrote reaches the model', () => {
  const salaryIssues = JSON.stringify([
    {
      name: 'Annual salary',
      unit: 'USD',
      learnerWants: 'higher',
      learner: { target: 130000, reservation: 115000, weight: 100 },
      counterpart: { target: 108000, reservation: 120000, weight: 100 },
    },
  ]);

  it('includes the persona backstory', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('A hiring manager at a tech company');
  });

  it('includes the confidential role brief and context notes', () => {
    const prompt = buildPersonaPrompt(
      { ...basePersona, role: { name: 'Employer', description: 'Budget freeze until Q3; retention bonus available.' } },
      { ...baseScenario, contextNotes: 'The company just missed its quarter.' }
    );
    expect(prompt).toContain('Budget freeze until Q3');
    expect(prompt).toContain('do not read it aloud');
    expect(prompt).toContain('The company just missed its quarter.');
  });

  it('includes framework elements, not just names', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).toContain('Market Research: Cited salary data');
  });

  it('turns openness into a resistance instruction', () => {
    const hard = buildPersonaPrompt({ ...basePersona, characteristics: JSON.stringify({ openness: 0.1 }) }, baseScenario);
    const soft = buildPersonaPrompt({ ...basePersona, characteristics: JSON.stringify({ openness: 0.9 }) }, baseScenario);
    expect(hard).toContain('Very hard to move');
    expect(soft).toContain('Very open');
  });

  it('states the counterpart target and walk-away and the hard rules', () => {
    const prompt = buildPersonaPrompt(basePersona, { ...baseScenario, issues: salaryIssues });
    expect(prompt).toContain('Your target: $108,000');
    expect(prompt).toContain('Your walk-away limit: $120,000');
    expect(prompt).toContain('you want it lower');
    expect(prompt).toContain('Never agree to, offer, or "approve" anything beyond your walk-away limit');
    expect(prompt).not.toContain('130,000');
  });

  it('omits the position block when the scenario has no issues', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).not.toContain('walk-away limit');
  });

  it('no longer caps replies at 2-4 sentences', () => {
    const prompt = buildPersonaPrompt(basePersona, baseScenario);
    expect(prompt).not.toContain('2-4 sentences max');
    expect(prompt).toContain('under 120 words');
  });
});

describe('buildPersonaPrompt: the trainee\'s side', () => {
  it('names the trainee\'s role and tells the persona it cannot see their private instructions', () => {
    const prompt = buildPersonaPrompt(basePersona, { ...baseScenario, learnerRole: { name: 'Employee' } });
    expect(prompt).toContain("The trainee's role: Employee (Job Candidate)");
    expect(prompt).toContain('You do not know their private instructions');
  });
  it('falls back to the scenario userRole without roles', () => {
    expect(buildPersonaPrompt(basePersona, baseScenario)).toContain("The trainee's role: Job Candidate.");
  });
});
