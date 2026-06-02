/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

const mockScenario = { findMany: jest.fn() };
const mockUserScenario = { findMany: jest.fn() };
const mockUserDb = { findUnique: jest.fn() };

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { scenario: mockScenario, userScenario: mockUserScenario, user: mockUserDb };
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../scenarios/search/route';

function req(query: string) {
  return new NextRequest(`http://localhost/api/scenarios/search?q=${encodeURIComponent(query)}`);
}

describe('GET /api/scenarios/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await GET(req('test'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for query shorter than 2 chars', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await GET(req('a'));
    expect(res.status).toBe(400);
  });

  it('returns matching scenarios', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([
      { id: 's1', title: 'Salary Negotiation', description: 'D', userRole: 'U', aiRole: 'A', joinCode: 'X', accessCode: null, _count: { personas: 3, members: 2 } },
    ]);
    const res = await GET(req('salary'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenarios).toHaveLength(1);
    expect(data.scenarios[0].title).toBe('Salary Negotiation');
    expect(data.scenarios[0].isRestricted).toBe(false);
  });

  it('marks already-joined scenarios', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([{ scenarioId: 's1' }]);
    mockScenario.findMany.mockResolvedValue([
      { id: 's1', title: 'Test', description: 'D', userRole: 'U', aiRole: 'A', joinCode: 'X', accessCode: null, _count: { personas: 1, members: 1 } },
    ]);
    const res = await GET(req('test'));
    const data = await res.json();
    expect(data.scenarios[0].alreadyJoined).toBe(true);
  });

  it('marks restricted scenarios', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([
      { id: 's1', title: 'Private', description: 'D', userRole: 'U', aiRole: 'A', joinCode: 'X', accessCode: 'secret123', _count: { personas: 1, members: 1 } },
    ]);
    const res = await GET(req('private'));
    const data = await res.json();
    expect(data.scenarios[0].isRestricted).toBe(true);
  });

  it('returns empty array for no matches', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);
    const res = await GET(req('xyznonexistent'));
    const data = await res.json();
    expect(data.scenarios).toEqual([]);
  });
});

// Helper to build requests with arbitrary query params (q and/or tag).
function reqParams(params: Record<string, string>) {
  const sp = new URLSearchParams(params);
  return new NextRequest(`http://localhost/api/scenarios/search?${sp.toString()}`);
}

describe('GET /api/scenarios/search — tag filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: new Date() });
    mockUserScenario.findMany.mockResolvedValue([]);
  });

  it('returns 400 when neither q nor tag is provided', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const res = await GET(reqParams({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/query or tag required/i);
  });

  it('returns 401 when not authenticated even with a tag', async () => {
    mockAuthFn.mockResolvedValue(null);
    const res = await GET(reqParams({ tag: 'negotiation' }));
    expect(res.status).toBe(401);
    expect(mockScenario.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when email is not verified even with a tag', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserDb.findUnique.mockResolvedValue({ emailVerified: null });
    const res = await GET(reqParams({ tag: 'negotiation' }));
    expect(res.status).toBe(403);
    expect(mockScenario.findMany).not.toHaveBeenCalled();
  });

  it('allows a tag-only search shorter than 2 chars (length rule only applies to q)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findMany.mockResolvedValue([]);
    const res = await GET(reqParams({ tag: 'a' }));
    expect(res.status).toBe(200);
    // The length validation guards `query`, not `tag`, so findMany still runs.
    expect(mockScenario.findMany).toHaveBeenCalled();
  });

  it('builds a JSON-substring contains filter on tags for a tag search', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findMany.mockResolvedValue([]);
    const res = await GET(reqParams({ tag: 'negotiation' }));
    expect(res.status).toBe(200);
    const whereArg = mockScenario.findMany.mock.calls[0][0].where;
    // Tag is matched as a quoted substring within the serialized JSON array.
    expect(whereArg.tags).toEqual({ contains: '"negotiation"' });
    // A tag-only search must not add a text OR clause.
    expect(whereArg.OR).toBeUndefined();
    expect(whereArg.status).toBe('published');
    expect(whereArg.visibility).toBe('public');
  });

  it('returns only scenarios whose tags include the requested tag', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    // Prisma (mocked) already applied the tag filter, so it returns the matching rows.
    mockScenario.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Salary Talk',
        description: 'D1',
        userRole: 'U',
        aiRole: 'A',
        joinCode: 'J1',
        accessCode: null,
        tags: '["negotiation","career"]',
        inspirationCount: 5,
        createdBy: { username: 'alice' },
        _count: { personas: 2, members: 3 },
      },
      {
        id: 's2',
        title: 'Vendor Deal',
        description: 'D2',
        userRole: 'U',
        aiRole: 'A',
        joinCode: 'J2',
        accessCode: null,
        tags: '["negotiation","business"]',
        inspirationCount: 1,
        createdBy: { username: 'bob' },
        _count: { personas: 1, members: 1 },
      },
    ]);
    const res = await GET(reqParams({ tag: 'negotiation' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenarios).toHaveLength(2);
    // Every returned scenario carries the requested tag in its parsed tags array.
    for (const s of data.scenarios) {
      expect(s.tags).toContain('negotiation');
    }
    expect(data.scenarios.map((s: { id: string }) => s.id)).toEqual(['s1', 's2']);
    expect(data.scenarios[0].creatorUsername).toBe('alice');
    expect(data.scenarios[0].inspirationCount).toBe(5);
  });

  it('combines q + tag: keeps the tag filter and adds a text OR without a tags OR branch', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Salary Negotiation',
        description: 'D',
        userRole: 'U',
        aiRole: 'A',
        joinCode: 'J1',
        accessCode: null,
        tags: '["negotiation"]',
        inspirationCount: 0,
        createdBy: { username: 'alice' },
        _count: { personas: 1, members: 1 },
      },
    ]);
    const res = await GET(reqParams({ q: 'salary', tag: 'negotiation' }));
    expect(res.status).toBe(200);
    const whereArg = mockScenario.findMany.mock.calls[0][0].where;
    // Both filters are present.
    expect(whereArg.tags).toEqual({ contains: '"negotiation"' });
    expect(Array.isArray(whereArg.OR)).toBe(true);
    // The text OR covers title/description/userRole/aiRole (4 branches),
    // and because a tag is set it must NOT also add a tags-contains branch.
    expect(whereArg.OR).toHaveLength(4);
    expect(whereArg.OR).toEqual(
      expect.arrayContaining([
        { title: { contains: 'salary' } },
        { description: { contains: 'salary' } },
        { userRole: { contains: 'salary' } },
        { aiRole: { contains: 'salary' } },
      ])
    );
    expect(whereArg.OR).not.toContainEqual({ tags: { contains: 'salary' } });
    const data = await res.json();
    expect(data.scenarios).toHaveLength(1);
    expect(data.scenarios[0].tags).toEqual(['negotiation']);
  });

  it('a q-only search (no tag) DOES add a tags-contains OR branch', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findMany.mockResolvedValue([]);
    const res = await GET(reqParams({ q: 'salary' }));
    expect(res.status).toBe(200);
    const whereArg = mockScenario.findMany.mock.calls[0][0].where;
    expect(whereArg.tags).toBeUndefined();
    expect(whereArg.OR).toHaveLength(5);
    expect(whereArg.OR).toContainEqual({ tags: { contains: 'salary' } });
  });

  it('returns an empty array when no scenario has the requested tag', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findMany.mockResolvedValue([]);
    const res = await GET(reqParams({ tag: 'nonexistenttag' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenarios).toEqual([]);
    expect(mockScenario.findMany.mock.calls[0][0].where.tags).toEqual({
      contains: '"nonexistenttag"',
    });
  });

  it('marks already-joined and restricted scenarios within tag results', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUserScenario.findMany.mockResolvedValue([{ scenarioId: 's1' }]);
    mockScenario.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Joined',
        description: 'D',
        userRole: 'U',
        aiRole: 'A',
        joinCode: 'J1',
        accessCode: null,
        tags: '["sales"]',
        inspirationCount: 0,
        createdBy: { username: 'alice' },
        _count: { personas: 1, members: 1 },
      },
      {
        id: 's2',
        title: 'Locked',
        description: 'D',
        userRole: 'U',
        aiRole: 'A',
        joinCode: 'J2',
        accessCode: 'secret',
        tags: '["sales"]',
        inspirationCount: 0,
        createdBy: { username: 'bob' },
        _count: { personas: 1, members: 1 },
      },
    ]);
    const res = await GET(reqParams({ tag: 'sales' }));
    const data = await res.json();
    expect(data.scenarios[0].alreadyJoined).toBe(true);
    expect(data.scenarios[0].isRestricted).toBe(false);
    expect(data.scenarios[1].alreadyJoined).toBe(false);
    expect(data.scenarios[1].isRestricted).toBe(true);
  });

  it('does not treat a tag substring as a match (quoted exact-token semantics)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findMany.mockResolvedValue([]);
    await GET(reqParams({ tag: 'neg' }));
    const whereArg = mockScenario.findMany.mock.calls[0][0].where;
    // The filter wraps the tag in quotes so "neg" won't loosely match "negotiation"
    // as a bare substring of a tag token; the quoted form requires the whole token.
    expect(whereArg.tags).toEqual({ contains: '"neg"' });
    expect(whereArg.tags.contains).toBe('"neg"');
  });

  it('propagates a database error from findMany when filtering by tag', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockScenario.findMany.mockRejectedValue(new Error('db down'));
    await expect(GET(reqParams({ tag: 'negotiation' }))).rejects.toThrow('db down');
  });
});
