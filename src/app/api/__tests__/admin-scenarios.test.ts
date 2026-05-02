/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockScenario = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
};
const mockPersona = {
  create: jest.fn(),
};
const mockUserScenario = {
  findUnique: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      scenario: mockScenario,
      persona: mockPersona,
      userScenario: mockUserScenario,
    };
  },
}));

import { GET, POST } from '../admin/scenarios/route';

describe('GET /api/admin/scenarios', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 for non-admin', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user' } });
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('returns scenarios for admin', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockScenario.findMany.mockResolvedValue([
      { id: 's1', title: 'Test', _count: { personas: 2, members: 1, conversations: 5 } },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.scenarios).toHaveLength(1);
  });
});

describe('POST /api/admin/scenarios', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates scenario with personas', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    mockScenario.create.mockResolvedValue({ id: 's-new', title: 'New Scenario' });
    mockPersona.create.mockResolvedValue({ id: 'p-new' });
    mockScenario.findUnique.mockResolvedValue({
      id: 's-new',
      title: 'New Scenario',
      personas: [{ id: 'p-new', name: 'Persona 1' }],
      _count: { members: 0 },
    });

    const request = new Request('http://localhost/api/admin/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'New Scenario',
        description: 'A test',
        userRole: 'Tester',
        aiRole: 'Subject',
        personas: [{ name: 'Persona 1', description: 'Test persona', roleType: 'Skeptic' }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockPersona.create).toHaveBeenCalled();
  });

  it('returns 400 when title is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    const request = new Request('http://localhost/api/admin/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'no title' }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
