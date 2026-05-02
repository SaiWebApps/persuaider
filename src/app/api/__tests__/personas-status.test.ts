/**
 * @jest-environment node
 */

/**
 * Tests for /api/personas/status route (GET).
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockPersona = {
  findMany: jest.fn(),
};
const mockConversation = {
  findMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      persona: mockPersona,
      conversation: mockConversation,
    };
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../personas/status/route';

function createRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/personas/status');
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url, { method: 'GET' });
}

describe('GET /api/personas/status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest({ scenarioId: 's1' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when scenarioId is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const req = createRequest();
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/scenarioId/i);
  });

  it('returns persona statuses with "available" when no conversations exist', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findMany.mockResolvedValue([
      { id: 'p1', name: 'Alex' },
      { id: 'p2', name: 'Jordan' },
    ]);
    // No in-progress or completed conversations
    mockConversation.findMany
      .mockResolvedValueOnce([])  // in_progress query
      .mockResolvedValueOnce([]); // completed query

    const req = createRequest({ scenarioId: 's1' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.personas).toHaveLength(2);
    expect(data.personas[0]).toEqual({ id: 'p1', name: 'Alex', status: 'available' });
    expect(data.personas[1]).toEqual({ id: 'p2', name: 'Jordan', status: 'available' });
  });

  it('marks persona as "in_progress" when conversation is active', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findMany.mockResolvedValue([
      { id: 'p1', name: 'Alex' },
      { id: 'p2', name: 'Jordan' },
    ]);
    mockConversation.findMany
      .mockResolvedValueOnce([{ personaId: 'p1' }])  // in_progress
      .mockResolvedValueOnce([]);                      // completed

    const req = createRequest({ scenarioId: 's1' });
    const res = await GET(req);
    const data = await res.json();
    expect(data.personas[0].status).toBe('in_progress');
    expect(data.personas[1].status).toBe('available');
  });

  it('marks persona as "completed" when conversation is completed', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findMany.mockResolvedValue([
      { id: 'p1', name: 'Alex' },
    ]);
    mockConversation.findMany
      .mockResolvedValueOnce([])                       // in_progress
      .mockResolvedValueOnce([{ personaId: 'p1' }]);   // completed

    const req = createRequest({ scenarioId: 's1' });
    const res = await GET(req);
    const data = await res.json();
    expect(data.personas[0].status).toBe('completed');
  });

  it('completed takes precedence over in_progress', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findMany.mockResolvedValue([
      { id: 'p1', name: 'Alex' },
    ]);
    // Both in-progress and completed conversations exist for same persona
    mockConversation.findMany
      .mockResolvedValueOnce([{ personaId: 'p1' }])   // in_progress
      .mockResolvedValueOnce([{ personaId: 'p1' }]);   // completed

    const req = createRequest({ scenarioId: 's1' });
    const res = await GET(req);
    const data = await res.json();
    expect(data.personas[0].status).toBe('completed');
  });

  it('queries conversations filtered by current user and scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findMany.mockResolvedValue([]);
    mockConversation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const req = createRequest({ scenarioId: 's42' });
    await GET(req);

    // in_progress query
    expect(mockConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          scenarioId: 's42',
          status: 'in_progress',
        }),
      })
    );

    // completed query
    expect(mockConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          scenarioId: 's42',
          status: 'completed',
        }),
      })
    );
  });
});
