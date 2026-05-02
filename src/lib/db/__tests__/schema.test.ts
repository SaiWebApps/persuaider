/**
 * @jest-environment node
 */

/**
 * Integration tests for the Prisma schema: Role, SourceFile, and updated Persona models.
 * These tests use the actual SQLite database to verify the migration works correctly.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Test data IDs (prefixed to avoid collisions with seed data)
const TEST_PREFIX = 'schema-test-';
const testUserId = `${TEST_PREFIX}user`;
const testScenarioId = `${TEST_PREFIX}scenario`;
const testRoleBuyerId = `${TEST_PREFIX}role-buyer`;
const testRoleSellerId = `${TEST_PREFIX}role-seller`;
const testPersonaId = `${TEST_PREFIX}persona`;
const testSourceFileId = `${TEST_PREFIX}sourcefile`;

beforeAll(async () => {
  // Create prerequisite user
  await prisma.user.upsert({
    where: { id: testUserId },
    update: {},
    create: {
      id: testUserId,
      email: `${TEST_PREFIX}@test.local`,
      username: `${TEST_PREFIX}user`,
      passwordHash: 'test-hash',
      provider: 'credentials',
    },
  });
});

afterAll(async () => {
  // Clean up test data in reverse dependency order
  await prisma.sourceFile.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.persona.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.role.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.scenario.deleteMany({ where: { id: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { id: testUserId } });
  await prisma.$disconnect();
});

describe('Scenario model - contextNotes field', () => {
  afterEach(async () => {
    await prisma.sourceFile.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.persona.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.role.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.scenario.deleteMany({ where: { id: testScenarioId } });
  });

  it('creates a scenario with contextNotes', async () => {
    const scenario = await prisma.scenario.create({
      data: {
        id: testScenarioId,
        title: 'Test Scenario',
        description: 'A test scenario',
        userRole: 'Buyer',
        aiRole: 'Seller',
        evaluationCriteria: '{}',
        winCondition: '{}',
        joinCode: `${TEST_PREFIX}JOIN1`,
        contextNotes: 'Students should demonstrate BATNA awareness',
        createdById: testUserId,
      },
    });

    expect(scenario.contextNotes).toBe('Students should demonstrate BATNA awareness');
  });

  it('creates a scenario with null contextNotes (backward compat)', async () => {
    const scenario = await prisma.scenario.create({
      data: {
        id: testScenarioId,
        title: 'Test Scenario',
        description: 'A test scenario',
        userRole: 'Buyer',
        aiRole: 'Seller',
        evaluationCriteria: '{}',
        winCondition: '{}',
        joinCode: `${TEST_PREFIX}JOIN2`,
        createdById: testUserId,
      },
    });

    expect(scenario.contextNotes).toBeNull();
  });
});

describe('Role model', () => {
  beforeEach(async () => {
    await prisma.scenario.upsert({
      where: { id: testScenarioId },
      update: {},
      create: {
        id: testScenarioId,
        title: 'Test Scenario',
        description: 'A test scenario',
        userRole: 'Buyer',
        aiRole: 'Seller',
        evaluationCriteria: '{}',
        winCondition: '{}',
        joinCode: `${TEST_PREFIX}ROLE`,
        createdById: testUserId,
      },
    });
  });

  afterEach(async () => {
    await prisma.persona.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.role.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.scenario.deleteMany({ where: { id: testScenarioId } });
  });

  it('creates roles for a scenario', async () => {
    const buyerRole = await prisma.role.create({
      data: {
        id: testRoleBuyerId,
        scenarioId: testScenarioId,
        name: 'Buyer',
        description: 'TechCorp VP of Corporate Development',
        displayOrder: 0,
      },
    });

    const sellerRole = await prisma.role.create({
      data: {
        id: testRoleSellerId,
        scenarioId: testScenarioId,
        name: 'Seller',
        description: 'InnoStart CEO',
        displayOrder: 1,
      },
    });

    expect(buyerRole.name).toBe('Buyer');
    expect(sellerRole.name).toBe('Seller');
    expect(buyerRole.scenarioId).toBe(testScenarioId);
  });

  it('fetches roles via scenario relation', async () => {
    await prisma.role.createMany({
      data: [
        { id: testRoleBuyerId, scenarioId: testScenarioId, name: 'Buyer', description: 'Buyer role', displayOrder: 0 },
        { id: testRoleSellerId, scenarioId: testScenarioId, name: 'Seller', description: 'Seller role', displayOrder: 1 },
      ],
    });

    const scenario = await prisma.scenario.findUnique({
      where: { id: testScenarioId },
      include: { roles: { orderBy: { displayOrder: 'asc' } } },
    });

    expect(scenario?.roles).toHaveLength(2);
    expect(scenario?.roles[0].name).toBe('Buyer');
    expect(scenario?.roles[1].name).toBe('Seller');
  });

  it('cascade deletes roles when scenario is deleted', async () => {
    await prisma.role.create({
      data: { id: testRoleBuyerId, scenarioId: testScenarioId, name: 'Buyer', description: 'Buyer', displayOrder: 0 },
    });

    await prisma.scenario.delete({ where: { id: testScenarioId } });

    const roles = await prisma.role.findMany({ where: { id: testRoleBuyerId } });
    expect(roles).toHaveLength(0);
  });
});

describe('Persona model - roleId field', () => {
  beforeEach(async () => {
    await prisma.scenario.upsert({
      where: { id: testScenarioId },
      update: {},
      create: {
        id: testScenarioId,
        title: 'Test Scenario',
        description: 'A test scenario',
        userRole: 'Buyer',
        aiRole: 'Seller',
        evaluationCriteria: '{}',
        winCondition: '{}',
        joinCode: `${TEST_PREFIX}PERS`,
        createdById: testUserId,
      },
    });
  });

  afterEach(async () => {
    await prisma.persona.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.role.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.scenario.deleteMany({ where: { id: testScenarioId } });
  });

  it('creates a persona linked to a role', async () => {
    const role = await prisma.role.create({
      data: { id: testRoleBuyerId, scenarioId: testScenarioId, name: 'Buyer', description: 'Buyer role', displayOrder: 0 },
    });

    const persona = await prisma.persona.create({
      data: {
        id: testPersonaId,
        scenarioId: testScenarioId,
        roleId: role.id,
        name: 'Aggressive Buyer',
        description: 'A hard-nosed negotiator',
        roleType: 'Aggressive',
        initialGreeting: 'Let\'s cut to the chase.',
        displayOrder: 0,
      },
    });

    expect(persona.roleId).toBe(role.id);
  });

  it('creates a persona without a role (legacy compatibility)', async () => {
    const persona = await prisma.persona.create({
      data: {
        id: testPersonaId,
        scenarioId: testScenarioId,
        name: 'Legacy Persona',
        description: 'Works without a role',
        roleType: 'Manager',
        displayOrder: 0,
      },
    });

    expect(persona.roleId).toBeNull();
  });

  it('fetches personas via role relation', async () => {
    const role = await prisma.role.create({
      data: { id: testRoleBuyerId, scenarioId: testScenarioId, name: 'Buyer', description: 'Buyer', displayOrder: 0 },
    });

    await prisma.persona.create({
      data: {
        id: testPersonaId,
        scenarioId: testScenarioId,
        roleId: role.id,
        name: 'Persona A',
        description: 'Test',
        roleType: 'Test',
        displayOrder: 0,
      },
    });

    const roleWithPersonas = await prisma.role.findUnique({
      where: { id: role.id },
      include: { personas: true },
    });

    expect(roleWithPersonas?.personas).toHaveLength(1);
    expect(roleWithPersonas?.personas[0].name).toBe('Persona A');
  });

  it('sets roleId to null when role is deleted (SetNull)', async () => {
    const role = await prisma.role.create({
      data: { id: testRoleBuyerId, scenarioId: testScenarioId, name: 'Buyer', description: 'Buyer', displayOrder: 0 },
    });

    await prisma.persona.create({
      data: {
        id: testPersonaId,
        scenarioId: testScenarioId,
        roleId: role.id,
        name: 'Persona A',
        description: 'Test',
        roleType: 'Test',
        displayOrder: 0,
      },
    });

    await prisma.role.delete({ where: { id: role.id } });

    const persona = await prisma.persona.findUnique({ where: { id: testPersonaId } });
    expect(persona?.roleId).toBeNull();
  });
});

describe('SourceFile model', () => {
  beforeEach(async () => {
    await prisma.scenario.upsert({
      where: { id: testScenarioId },
      update: {},
      create: {
        id: testScenarioId,
        title: 'Test Scenario',
        description: 'A test scenario',
        userRole: 'Buyer',
        aiRole: 'Seller',
        evaluationCriteria: '{}',
        winCondition: '{}',
        joinCode: `${TEST_PREFIX}SRCF`,
        createdById: testUserId,
      },
    });
  });

  afterEach(async () => {
    await prisma.sourceFile.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.scenario.deleteMany({ where: { id: testScenarioId } });
  });

  it('creates a source file linked to a scenario', async () => {
    const file = await prisma.sourceFile.create({
      data: {
        id: testSourceFileId,
        scenarioId: testScenarioId,
        filename: 'negotiation-case.pdf',
        storagePath: 'uploads/scenarios/abc123.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2_400_000,
        displayOrder: 0,
      },
    });

    expect(file.filename).toBe('negotiation-case.pdf');
    expect(file.mimeType).toBe('application/pdf');
    expect(file.sizeBytes).toBe(2_400_000);
  });

  it('creates multiple source files for one scenario', async () => {
    await prisma.sourceFile.createMany({
      data: [
        {
          id: `${TEST_PREFIX}sf1`,
          scenarioId: testScenarioId,
          filename: 'case.pdf',
          storagePath: 'uploads/scenarios/case.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1_000_000,
          displayOrder: 0,
        },
        {
          id: `${TEST_PREFIX}sf2`,
          scenarioId: testScenarioId,
          filename: 'miro-board.png',
          storagePath: 'uploads/scenarios/miro.png',
          mimeType: 'image/png',
          sizeBytes: 500_000,
          displayOrder: 1,
        },
      ],
    });

    const scenario = await prisma.scenario.findUnique({
      where: { id: testScenarioId },
      include: { sourceFiles: { orderBy: { displayOrder: 'asc' } } },
    });

    expect(scenario?.sourceFiles).toHaveLength(2);
    expect(scenario?.sourceFiles[0].mimeType).toBe('application/pdf');
    expect(scenario?.sourceFiles[1].mimeType).toBe('image/png');
  });

  it('cascade deletes source files when scenario is deleted', async () => {
    await prisma.sourceFile.create({
      data: {
        id: testSourceFileId,
        scenarioId: testScenarioId,
        filename: 'test.pdf',
        storagePath: 'uploads/test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        displayOrder: 0,
      },
    });

    await prisma.scenario.delete({ where: { id: testScenarioId } });

    const files = await prisma.sourceFile.findMany({ where: { id: testSourceFileId } });
    expect(files).toHaveLength(0);
  });
});

describe('Full scenario with roles, personas, and source files', () => {
  afterEach(async () => {
    await prisma.sourceFile.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.persona.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.role.deleteMany({ where: { scenarioId: testScenarioId } });
    await prisma.scenario.deleteMany({ where: { id: testScenarioId } });
  });

  it('creates a complete multi-role scenario', async () => {
    // Create scenario
    const scenario = await prisma.scenario.create({
      data: {
        id: testScenarioId,
        title: 'TechCorp Acquisition',
        description: 'Negotiate the acquisition of InnoStart by TechCorp.',
        userRole: 'See roles',
        aiRole: 'See roles',
        evaluationCriteria: JSON.stringify({ frameworks: [], scoringInstructions: 'Evaluate both sides.' }),
        winCondition: JSON.stringify({ type: 'manual', maxMessages: 30 }),
        joinCode: `${TEST_PREFIX}FULL`,
        contextNotes: 'Focus on BATNA and reservation prices.',
        createdById: testUserId,
      },
    });

    // Create roles
    const buyerRole = await prisma.role.create({
      data: { id: testRoleBuyerId, scenarioId: scenario.id, name: 'Buyer', description: 'TechCorp VP', displayOrder: 0 },
    });
    const sellerRole = await prisma.role.create({
      data: { id: testRoleSellerId, scenarioId: scenario.id, name: 'Seller', description: 'InnoStart CEO', displayOrder: 1 },
    });

    // Create personas linked to roles
    await prisma.persona.createMany({
      data: [
        {
          id: `${TEST_PREFIX}p-buyer-1`,
          scenarioId: scenario.id,
          roleId: buyerRole.id,
          name: 'Aggressive Buyer',
          description: 'Pushes hard on price',
          roleType: 'Aggressive',
          displayOrder: 0,
        },
        {
          id: `${TEST_PREFIX}p-buyer-2`,
          scenarioId: scenario.id,
          roleId: buyerRole.id,
          name: 'Collaborative Buyer',
          description: 'Seeks win-win',
          roleType: 'Collaborative',
          displayOrder: 1,
        },
        {
          id: `${TEST_PREFIX}p-seller-1`,
          scenarioId: scenario.id,
          roleId: sellerRole.id,
          name: 'Proud Founder',
          description: 'Emotionally attached to company',
          roleType: 'Defensive',
          displayOrder: 0,
        },
      ],
    });

    // Create source file
    await prisma.sourceFile.create({
      data: {
        id: testSourceFileId,
        scenarioId: scenario.id,
        filename: 'acquisition-case.pdf',
        storagePath: 'uploads/scenarios/acq.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 3_000_000,
        displayOrder: 0,
      },
    });

    // Fetch the complete scenario with all relations
    const fullScenario = await prisma.scenario.findUnique({
      where: { id: testScenarioId },
      include: {
        roles: {
          orderBy: { displayOrder: 'asc' },
          include: { personas: { orderBy: { displayOrder: 'asc' } } },
        },
        sourceFiles: { orderBy: { displayOrder: 'asc' } },
      },
    });

    // Verify structure
    expect(fullScenario).not.toBeNull();
    expect(fullScenario!.title).toBe('TechCorp Acquisition');
    expect(fullScenario!.contextNotes).toBe('Focus on BATNA and reservation prices.');

    // Roles
    expect(fullScenario!.roles).toHaveLength(2);
    expect(fullScenario!.roles[0].name).toBe('Buyer');
    expect(fullScenario!.roles[1].name).toBe('Seller');

    // Buyer role has 2 personas
    expect(fullScenario!.roles[0].personas).toHaveLength(2);
    expect(fullScenario!.roles[0].personas[0].name).toBe('Aggressive Buyer');
    expect(fullScenario!.roles[0].personas[1].name).toBe('Collaborative Buyer');

    // Seller role has 1 persona
    expect(fullScenario!.roles[1].personas).toHaveLength(1);
    expect(fullScenario!.roles[1].personas[0].name).toBe('Proud Founder');

    // Source files
    expect(fullScenario!.sourceFiles).toHaveLength(1);
    expect(fullScenario!.sourceFiles[0].filename).toBe('acquisition-case.pdf');
  });
});
