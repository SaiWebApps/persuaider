/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

const mockScenario = { findMany: jest.fn() };
const mockUserScenario = { findMany: jest.fn() };

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { scenario: mockScenario, userScenario: mockUserScenario };
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../scenarios/search/route';

function req(query: string) {
  return new NextRequest(`http://localhost/api/scenarios/search?q=${encodeURIComponent(query)}`);
}

describe('GET /api/scenarios/search', () => {
  beforeEach(() => jest.clearAllMocks());

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
