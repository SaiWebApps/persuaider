import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function generateJoinCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function main() {
  console.log('Seeding database...');

  // Clean slate: remove all transient data from previous runs
  await prisma.summary.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.userScenario.deleteMany({});
  console.log('Cleaned previous session data');

  // Create a system user to own the example scenario
  const hashedPassword = await bcrypt.hash('example-password', 10);

  const systemUser = await prisma.user.upsert({
    where: { email: 'system@persuaider.local' },
    update: { role: 'admin', emailVerified: new Date() },
    create: {
      email: 'system@persuaider.local',
      username: 'system',
      passwordHash: hashedPassword,
      role: 'admin',
      provider: 'credentials',
      emailVerified: new Date(),
    },
  });

  console.log('Created system user:', systemUser.username);

  // Create a demo user for testing
  const demoPassword = await bcrypt.hash('demo123', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@persuaider.com' },
    update: { emailVerified: new Date() },
    create: {
      email: 'demo@persuaider.com',
      username: 'Demo User',
      passwordHash: demoPassword,
      provider: 'credentials',
      emailVerified: new Date(),
    },
  });

  console.log('Created demo user:', demoUser.email, '(password: demo123)');

  // Create an admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@persuaider.local' },
    update: { role: 'admin', passwordHash: adminPassword, emailVerified: new Date() },
    create: {
      email: 'admin@persuaider.local',
      username: 'Admin',
      passwordHash: adminPassword,
      role: 'admin',
      provider: 'credentials',
      emailVerified: new Date(),
    },
  });

  console.log('Created admin user:', adminUser.email, '(password: admin123)');

  // Create an example scenario: a salary negotiation
  const evaluationCriteria = JSON.stringify({
    frameworks: [
      {
        name: 'Preparation & Research',
        description: 'How well the negotiator demonstrates knowledge of market rates, company context, and their own value.',
        elements: [
          { name: 'Market awareness', description: 'References industry benchmarks or comparable salaries' },
          { name: 'Self-assessment', description: 'Articulates specific contributions and achievements' },
        ],
        weight: 0.3,
      },
      {
        name: 'Communication & Persuasion',
        description: 'Clarity, confidence, and persuasiveness of arguments.',
        elements: [
          { name: 'Clarity', description: 'Makes clear, structured arguments' },
          { name: 'Active listening', description: 'Acknowledges and responds to counterpoints' },
          { name: 'Confidence', description: 'Maintains composure and professional tone' },
        ],
        weight: 0.4,
      },
      {
        name: 'Strategy & Flexibility',
        description: 'Ability to adapt, offer creative solutions, and work toward mutual benefit.',
        elements: [
          { name: 'BATNA awareness', description: 'Demonstrates knowledge of alternatives' },
          { name: 'Creative solutions', description: 'Proposes non-salary benefits or phased approaches' },
          { name: 'Win-win framing', description: 'Frames requests as mutually beneficial' },
        ],
        weight: 0.3,
      },
    ],
    scoringInstructions: 'Evaluate the negotiator on each framework. Consider how well they balanced assertiveness with collaboration. A score of 70+ indicates a competent negotiation; 85+ indicates an excellent one.',
  });

  const winCondition = JSON.stringify({
    type: 'manual',
    maxMessages: 30,
  });

  const scenario = await prisma.scenario.upsert({
    where: { joinCode: 'EXAMPLE1' },
    update: {},
    create: {
      title: 'Salary Negotiation',
      description: 'You are negotiating a raise with your manager after a strong performance year. Your goal is to secure a meaningful salary increase while maintaining a positive working relationship.',
      userRole: 'Employee requesting a raise',
      aiRole: 'Hiring manager / direct supervisor',
      evaluationCriteria,
      winCondition,
      visibility: 'public',
      joinCode: 'EXAMPLE1',
      tags: JSON.stringify(['negotiation', 'salary', 'workplace', 'example']),
      status: 'published',
      createdById: systemUser.id,
    },
  });

  console.log('Created scenario:', scenario.title);

  // Create personas for this scenario
  const personas = [
    {
      name: 'Alex Chen',
      description: 'A reasonable but budget-conscious manager who values data-driven arguments. Open to discussion but needs convincing justification.',
      roleType: 'Supportive but cautious manager',
      initialGreeting: "Thanks for setting up this meeting. I saw you wanted to discuss your compensation — I'm happy to listen. What's on your mind?",
      characteristics: JSON.stringify({
        openness: 4,
        concerns: ['budget constraints', 'team equity', 'setting precedents'],
        personality: ['data-driven', 'fair-minded', 'pragmatic', 'approachable'],
        roleBehavior: 'Listens carefully, asks for evidence, raises budget concerns but is ultimately willing to negotiate if given strong reasons.',
      }),
      displayOrder: 1,
    },
    {
      name: 'Jordan Wallace',
      description: 'A tough negotiator who pushes back hard. Responds well to confidence and preparation but will exploit weak arguments.',
      roleType: 'Hard-nosed executive',
      initialGreeting: "I have 15 minutes. You mentioned wanting to talk about your pay. Go ahead — but I'll be direct with you, we've already allocated this year's raises.",
      characteristics: JSON.stringify({
        openness: 2,
        concerns: ['bottom line', 'company policy', 'performance metrics'],
        personality: ['direct', 'skeptical', 'time-pressured', 'results-oriented'],
        roleBehavior: 'Challenges every point, references company policy, but respects well-prepared arguments. Will concede ground if the employee demonstrates clear, measurable value.',
      }),
      displayOrder: 2,
    },
    {
      name: 'Pat Morales',
      description: 'A new manager who is empathetic but unsure of their authority. Wants to help but may need the employee to help them make the case upward.',
      roleType: 'Empathetic but uncertain manager',
      initialGreeting: "Hey, come on in. I got your message about wanting to chat. I want you to know I really value your work here — let's talk about what you're thinking.",
      characteristics: JSON.stringify({
        openness: 5,
        concerns: ['getting approval from above', 'fairness to the team', 'their own credibility'],
        personality: ['empathetic', 'collaborative', 'slightly nervous', 'people-pleaser'],
        roleBehavior: 'Agrees easily but then raises obstacles about needing approval. The employee needs to help build a case that Pat can take to leadership.',
      }),
      displayOrder: 3,
    },
  ];

  for (const personaData of personas) {
    const persona = await prisma.persona.upsert({
      where: { id: `seed-${scenario.id}-${personaData.displayOrder}` },
      update: personaData,
      create: {
        id: `seed-${scenario.id}-${personaData.displayOrder}`,
        scenarioId: scenario.id,
        ...personaData,
      },
    });
    console.log('Created persona:', persona.name);
  }

  // Add demo user as a member of the example scenario
  await prisma.userScenario.upsert({
    where: {
      userId_scenarioId: {
        userId: demoUser.id,
        scenarioId: scenario.id,
      },
    },
    update: {},
    create: {
      userId: demoUser.id,
      scenarioId: scenario.id,
    },
  });

  console.log('Added demo user to scenario:', scenario.title);

  // --- Demo Scenario 2: AI Adoption (example of a change-management negotiation) ---

  const aiAdoptionCriteria = JSON.stringify({
    frameworks: [
      {
        name: 'CLEAR Framework',
        description: 'Objection handling: Capture, Label, Empathize, Answer, Request',
        elements: [
          { name: 'Capture', description: 'Accurately repeats or paraphrases the concern' },
          { name: 'Label', description: 'Categorizes using MAPPR (Money, Authority, Priority, Performance, Risk)' },
          { name: 'Empathize', description: 'Validates the feeling without dismissing it' },
          { name: 'Answer', description: 'Provides Truth + Meaning + Proof' },
          { name: 'Request', description: 'Makes a specific next-step request' },
        ],
        weight: 0.5,
      },
      {
        name: 'AIDA Framework',
        description: 'Persuasion: Attention, Interest, Desire, Action',
        elements: [
          { name: 'Attention', description: 'Uses surprising facts or statistics to engage' },
          { name: 'Interest', description: 'Shows direct relevance to the listener' },
          { name: 'Desire', description: 'Highlights tangible benefits they care about' },
          { name: 'Action', description: 'Proposes specific, low-risk actionable steps' },
        ],
        weight: 0.5,
      },
    ],
    scoringInstructions: 'Evaluate how effectively the advocate used CLEAR for handling objections and AIDA for persuasion. A score of 70+ indicates competent advocacy; 85+ indicates excellent persuasion.',
  });

  const aiScenario = await prisma.scenario.upsert({
    where: { joinCode: 'AIADOPT1' },
    update: {},
    create: {
      title: 'Convince Your Team to Adopt AI',
      description: 'You are a technology advocate tasked with convincing skeptical colleagues to adopt AI tools in their daily workflows. Each colleague has different concerns and resistance patterns.',
      userRole: 'Technology advocate / change champion',
      aiRole: 'Skeptical colleague',
      evaluationCriteria: aiAdoptionCriteria,
      winCondition: JSON.stringify({ type: 'manual', maxMessages: 30 }),
      visibility: 'public',
      joinCode: 'AIADOPT1',
      tags: JSON.stringify(['negotiation', 'change-management', 'ai-adoption', 'example']),
      status: 'published',
      createdById: systemUser.id,
    },
  });

  console.log('Created scenario:', aiScenario.title);

  const aiPersonas = [
    {
      name: 'Sarah the Security Hawk',
      description: 'A methodical security-focused professional who demands proof of compliance and data protection before considering any new tool.',
      roleType: 'Security-conscious skeptic',
      initialGreeting: "I got your meeting invite about AI tools. Before we start — have these been through our security review? I need to know about data handling, access controls, and compliance certifications.",
      characteristics: JSON.stringify({
        openness: 2,
        concerns: ['privacy and data breaches', 'regulatory compliance', 'unauthorized data access', 'vendor security posture'],
        personality: ['methodical', 'cautious', 'detail-oriented', 'policy-focused'],
        roleBehavior: 'Demands specific security certifications and compliance guarantees. Will not budge without concrete evidence of data protection measures.',
      }),
      displayOrder: 1,
    },
    {
      name: 'Bob the Dinosaur',
      description: 'A veteran employee who has seen tech fads come and go. Deeply skeptical of AI and protective of traditional methods.',
      roleType: 'Change-resistant veteran',
      initialGreeting: "AI tools? Look, I've been doing this job for 25 years without any of that. Last time management pushed a new 'revolutionary' system on us, it was that disaster of a CRM three years ago. What makes this any different?",
      characteristics: JSON.stringify({
        openness: 1,
        concerns: ['job replacement', 'steep learning curve', 'unreliable technology', 'loss of expertise value'],
        personality: ['resistant', 'nostalgic', 'territorial', 'proud of experience'],
        roleBehavior: 'Dismisses AI as a fad, brings up past tech failures, worries about being replaced. Very hard to convince but will soften if shown AI augments rather than replaces his expertise.',
      }),
      displayOrder: 2,
    },
    {
      name: 'Karen the Quality Controller',
      description: 'A perfectionist who worries about AI hallucinations and the impact on professional standards.',
      roleType: 'Standards-driven perfectionist',
      initialGreeting: "I'm willing to listen, but I have serious concerns about quality. I've seen those AI chatbots hallucinate confidently about things that are completely wrong. How do we maintain our professional standards with tools like that?",
      characteristics: JSON.stringify({
        openness: 3,
        concerns: ['accuracy and hallucinations', 'professional liability', 'quality degradation', 'client trust'],
        personality: ['perfectionist', 'thorough', 'standards-driven', 'risk-averse'],
        roleBehavior: 'Demands evidence of accuracy rates, asks about error correction workflows, and needs assurance that AI output will be reviewed by humans.',
      }),
      displayOrder: 3,
    },
    {
      name: 'Frank the Finance Guy',
      description: 'An analytical numbers person who wants hard ROI data before approving any expenditure.',
      roleType: 'Budget-conscious analyst',
      initialGreeting: "Sure, let's talk numbers. What's the per-seat licensing cost? What's the implementation cost? And more importantly, what's the projected ROI and by when? Because my budget is already stretched thin.",
      characteristics: JSON.stringify({
        openness: 3,
        concerns: ['ROI uncertainty', 'hidden costs', 'subscription fatigue', 'budget constraints'],
        personality: ['analytical', 'numbers-focused', 'skeptical of hype', 'pragmatic'],
        roleBehavior: 'Requires concrete cost-benefit analysis with real numbers. Will respond to data-driven arguments but dismisses vague promises of efficiency gains.',
      }),
      displayOrder: 4,
    },
    {
      name: 'Martha the Craftsperson',
      description: 'A creative professional who values authenticity and the human touch in work.',
      roleType: 'Values-driven creative',
      initialGreeting: "I appreciate you thinking of the team, but I'm worried this is going to turn our work into something generic and soulless. Our clients chose us for the human touch. What happens to that?",
      characteristics: JSON.stringify({
        openness: 2,
        concerns: ['losing human touch', 'creativity devaluation', 'authenticity erosion', 'client relationship damage'],
        personality: ['passionate', 'artistic', 'values-driven', 'tradition-respecting'],
        roleBehavior: 'Argues that AI output lacks soul and nuance. Needs to be shown that AI handles the mundane so she can focus MORE on creative work, not less.',
      }),
      displayOrder: 5,
    },
    {
      name: 'Tech-Timid Tim',
      description: 'A well-meaning colleague who wants to try new things but is overwhelmed by technology.',
      roleType: 'Anxious but willing learner',
      initialGreeting: "Oh, AI tools? I... I've heard about those. I'm not very tech-savvy, honestly. I tried ChatGPT once and got overwhelmed by all the options. Is this going to be really complicated? I don't want to break anything.",
      characteristics: JSON.stringify({
        openness: 4,
        concerns: ['complexity', 'breaking things', 'looking foolish in front of colleagues', 'information overload'],
        personality: ['anxious', 'willing but scared', 'self-deprecating', 'cautious'],
        roleBehavior: 'Wants step-by-step guidance and reassurance. Worries about messing up. The easiest persona to convince if you are patient and empathetic.',
      }),
      displayOrder: 6,
    },
  ];

  for (const personaData of aiPersonas) {
    const persona = await prisma.persona.upsert({
      where: { id: `seed-${aiScenario.id}-${personaData.displayOrder}` },
      update: personaData,
      create: {
        id: `seed-${aiScenario.id}-${personaData.displayOrder}`,
        scenarioId: aiScenario.id,
        ...personaData,
      },
    });
    console.log('Created persona:', persona.name);
  }

  // Add demo user to AI adoption scenario too
  await prisma.userScenario.upsert({
    where: {
      userId_scenarioId: {
        userId: demoUser.id,
        scenarioId: aiScenario.id,
      },
    },
    update: {},
    create: {
      userId: demoUser.id,
      scenarioId: aiScenario.id,
    },
  });

  console.log('Added demo user to scenario:', aiScenario.title);

  console.log('Seed complete.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Error seeding database:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
