/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/personas route.
 */
import { NextRequest } from 'next/server';

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockPersona = {
  findMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      persona: mockPersona,
    };
  },
}));

import { GET } from '../personas/route';

describe('GET /api/personas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const request = new NextRequest('http://localhost:3000/api/personas?scenarioId=s1');
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('returns 400 when scenarioId is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const request = new NextRequest('http://localhost:3000/api/personas');
    const response = await GET(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('scenarioId');
  });

  it('returns personas for a given scenarioId', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    const personas = [
      { id: 'p1', name: 'Alex', description: 'Manager', roleType: 'Manager', scenarioId: 's1' },
      { id: 'p2', name: 'Sarah', description: 'VP', roleType: 'VP', scenarioId: 's1' },
    ];
    mockPersona.findMany.mockResolvedValue(personas);

    const request = new NextRequest('http://localhost:3000/api/personas?scenarioId=s1');
    const response = await GET(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.personas).toEqual(personas);
  });

  it('queries personas ordered by displayOrder', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'user-1' } });
    mockPersona.findMany.mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/personas?scenarioId=s1');
    await GET(request);

    expect(mockPersona.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scenarioId: 's1' },
        orderBy: { displayOrder: 'asc' },
      })
    );
  });
});
