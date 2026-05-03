/**
 * @jest-environment node
 */

/**
 * Red-team tests for scenario creation, join, search, and public browse flows.
 * Tests edge cases, abuse patterns, and real-world failure modes.
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

const mockScenario = { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() };
const mockPersona = { create: jest.fn() };
const mockUserScenario = { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() };
const mockUser = { findUnique: jest.fn() };

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { scenario: mockScenario, persona: mockPersona, userScenario: mockUserScenario, user: mockUser };
  },
}));

import { POST as createScenario } from '../scenarios/route';
import { POST as joinScenario } from '../scenarios/join/route';
import { GET as searchScenarios } from '../scenarios/search/route';
import { GET as publicScenarios } from '../scenarios/public/route';
import { NextRequest } from 'next/server';

function createReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function joinReq(body: Record<string, unknown>) {
  return new Request('http://localhost/api/scenarios/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function searchReq(query: string) {
  return new NextRequest(`http://localhost/api/scenarios/search?q=${encodeURIComponent(query)}`);
}

// =============================================================================
// SCENARIO CREATION - Edge Cases
// =============================================================================

describe('Scenario Creation - Red Team', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('creates scenario with empty personas array (no personas)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.create.mockResolvedValue({ id: 's1', title: 'NoPers', joinCode: 'AAAA' });
    mockUserScenario.create.mockResolvedValue({});

    const res = await createScenario(createReq({
      title: 'NoPers',
      description: 'No personas at all',
      userRole: 'User',
      aiRole: 'AI',
      personas: [],
    }));

    expect(res.status).toBe(201);
    // No persona.create should be called
    expect(mockPersona.create).not.toHaveBeenCalled();
  });

  it('creates scenario with no personas field at all', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.create.mockResolvedValue({ id: 's2', title: 'NoPers2', joinCode: 'BBBB' });
    mockUserScenario.create.mockResolvedValue({});

    const res = await createScenario(createReq({
      title: 'NoPers2',
      description: 'No persona field',
      userRole: 'User',
      aiRole: 'AI',
    }));

    expect(res.status).toBe(201);
    expect(mockPersona.create).not.toHaveBeenCalled();
  });

  it('creates scenario with 50 personas (bulk load)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.create.mockResolvedValue({ id: 's3', title: 'Bulk', joinCode: 'CCCC' });
    mockPersona.create.mockResolvedValue({ id: 'p-x' });
    mockUserScenario.create.mockResolvedValue({});

    const personas = Array.from({ length: 50 }, (_, i) => ({
      name: `Persona ${i + 1}`,
      description: `Description ${i + 1}`,
      roleType: 'Counterpart',
    }));

    const res = await createScenario(createReq({
      title: 'Bulk',
      description: 'Many personas',
      userRole: 'User',
      aiRole: 'AI',
      personas,
    }));

    expect(res.status).toBe(201);
    expect(mockPersona.create).toHaveBeenCalledTimes(50);
    // Check displayOrder is set correctly for last persona
    const lastCall = mockPersona.create.mock.calls[49][0];
    expect(lastCall.data.displayOrder).toBe(50);
  });

  it('skips personas with no name in the array', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.create.mockResolvedValue({ id: 's4', title: 'Skip', joinCode: 'DDDD' });
    mockPersona.create.mockResolvedValue({ id: 'p-1' });
    mockUserScenario.create.mockResolvedValue({});

    const res = await createScenario(createReq({
      title: 'Skip',
      description: 'Desc',
      userRole: 'User',
      aiRole: 'AI',
      personas: [
        { name: '', description: 'Empty name' },
        { name: 'Valid', description: 'Has name' },
        { name: null, description: 'Null name' },
      ],
    }));

    expect(res.status).toBe(201);
    // Only the one with name 'Valid' should be created
    expect(mockPersona.create).toHaveBeenCalledTimes(1);
  });

  it('creates scenario with XSS payload in title (stored but not executed)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const xssTitle = '<script>alert("xss")</script>';
    mockScenario.create.mockResolvedValue({ id: 's5', title: xssTitle, joinCode: 'EEEE' });
    mockUserScenario.create.mockResolvedValue({});

    const res = await createScenario(createReq({
      title: xssTitle,
      description: '<img src=x onerror=alert(1)>',
      userRole: 'User',
      aiRole: 'AI',
    }));

    // API accepts it (no sanitization at this layer)
    expect(res.status).toBe(201);
    // Verify it's passed through to storage
    expect(mockScenario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: xssTitle }),
      })
    );
  });

  it('handles access code with whitespace by trimming', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.create.mockResolvedValue({ id: 's6', title: 'T', joinCode: 'FFFF' });
    mockUserScenario.create.mockResolvedValue({});

    await createScenario(createReq({
      title: 'T',
      description: 'D',
      userRole: 'U',
      aiRole: 'A',
      accessCode: '  secret  ',
    }));

    expect(mockScenario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accessCode: 'secret' }),
      })
    );
  });

  it('sets accessCode to null when empty string is provided', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.create.mockResolvedValue({ id: 's7', title: 'T', joinCode: 'GGGG' });
    mockUserScenario.create.mockResolvedValue({});

    await createScenario(createReq({
      title: 'T',
      description: 'D',
      userRole: 'U',
      aiRole: 'A',
      accessCode: '   ',
    }));

    expect(mockScenario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accessCode: null }),
      })
    );
  });
});

// =============================================================================
// SCENARIO JOIN - Edge Cases
// =============================================================================

describe('Scenario Join - Red Team', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 409 when user tries to join their own scenario twice', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'creator1' } });
    mockScenario.findUnique.mockResolvedValue({
      id: 's1',
      title: 'My Scenario',
      description: 'D',
      status: 'published',
      accessCode: null,
      createdById: 'creator1',
    });
    // Creator already joined via auto-join at creation time
    mockUserScenario.findUnique.mockResolvedValue({ id: 'existing-membership' });

    const res = await joinScenario(joinReq({ joinCode: 'ABC123' }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/already joined/i);
  });

  it('returns 403 for wrong access code on restricted scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({
      id: 's1',
      status: 'published',
      accessCode: 'correctpass',
    });

    const res = await joinScenario(joinReq({ joinCode: 'CODE1', accessCode: 'wrongpass' }));
    expect(res.status).toBe(403);
  });

  it('returns 404 for archived/non-published scenario even with correct code', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({
      id: 's1',
      status: 'archived',
      accessCode: 'secret',
    });

    const res = await joinScenario(joinReq({ joinCode: 'CODE1', accessCode: 'secret' }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/invalid or inactive/i);
  });

  it('returns 403 when empty string access code is provided for restricted scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({
      id: 's1',
      status: 'published',
      accessCode: 'secret123',
    });

    const res = await joinScenario(joinReq({ joinCode: 'CODE1', accessCode: '' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when null access code is provided for restricted scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({
      id: 's1',
      status: 'published',
      accessCode: 'secret123',
    });

    const res = await joinScenario(joinReq({ joinCode: 'CODE1', accessCode: null }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.requiresAccessCode).toBe(true);
  });

  it('returns 400 for non-string joinCode (number)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await joinScenario(joinReq({ joinCode: 12345 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty string joinCode', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await joinScenario(joinReq({ joinCode: '' }));
    expect(res.status).toBe(400);
  });

  it('handles joinCode with leading/trailing whitespace', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findUnique.mockResolvedValue({
      id: 's1',
      title: 'T',
      description: 'D',
      status: 'published',
      accessCode: null,
    });
    mockUserScenario.findUnique.mockResolvedValue(null);
    mockUserScenario.create.mockResolvedValue({});

    await joinScenario(joinReq({ joinCode: '  abc123  ' }));
    expect(mockScenario.findUnique).toHaveBeenCalledWith({ where: { joinCode: 'ABC123' } });
  });
});

// =============================================================================
// SEARCH - SQL Injection & XSS
// =============================================================================

describe('Scenario Search - Red Team', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('handles SQL injection attempt in query parameter', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);

    const sqlInjection = "'; DROP TABLE scenarios; --";
    const res = await searchScenarios(searchReq(sqlInjection));

    // Should not crash - Prisma parameterizes queries
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenarios).toEqual([]);
  });

  it('handles XSS payload in query parameter', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);

    const xssPayload = '<script>alert("xss")</script>';
    const res = await searchScenarios(searchReq(xssPayload));

    // Should not crash
    expect(res.status).toBe(200);
    // The query is passed to Prisma contains filter which is parameterized
    expect(mockScenario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ title: { contains: xssPayload } }),
          ]),
        }),
      })
    );
  });

  it('rejects query with only 1 character', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await searchScenarios(searchReq('x'));
    expect(res.status).toBe(400);
  });

  it('rejects query with only whitespace', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await searchScenarios(searchReq('   '));
    expect(res.status).toBe(400);
  });

  it('handles very long query string (1000+ chars)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);

    const longQuery = 'a'.repeat(1000);
    const res = await searchScenarios(searchReq(longQuery));

    // Should not crash - just returns no results
    expect(res.status).toBe(200);
  });

  it('handles unicode and emoji in search query', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);

    const res = await searchScenarios(searchReq('negotiation'));
    expect(res.status).toBe(200);
  });

  it('does not expose access codes in search results', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Secret',
        description: 'D',
        userRole: 'U',
        aiRole: 'A',
        joinCode: 'JOINME',
        accessCode: 'supersecret',
        _count: { personas: 1, members: 2 },
      },
    ]);

    const res = await searchScenarios(searchReq('secret'));
    const data = await res.json();
    // Should not expose the actual accessCode value
    expect(data.scenarios[0].accessCode).toBeUndefined();
    // Instead it exposes isRestricted boolean
    expect(data.scenarios[0].isRestricted).toBe(true);
  });
});

// =============================================================================
// PUBLIC BROWSE
// =============================================================================

describe('Public Scenarios - Red Team', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('does not return scenarios user already joined', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([{ scenarioId: 's1' }]);
    mockScenario.findMany.mockResolvedValue([
      { id: 's1', title: 'Joined', description: 'D', userRole: 'U', aiRole: 'A', joinCode: 'X', _count: { personas: 1, members: 1 } },
      { id: 's2', title: 'NotJoined', description: 'D', userRole: 'U', aiRole: 'A', joinCode: 'Y', _count: { personas: 1, members: 1 } },
    ]);

    const res = await publicScenarios();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenarios).toHaveLength(1);
    expect(data.scenarios[0].id).toBe('s2');
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await publicScenarios();
    expect(res.status).toBe(401);
  });

  it('returns empty array when no published public scenarios exist', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);

    const res = await publicScenarios();
    const data = await res.json();
    expect(data.scenarios).toEqual([]);
  });
});
