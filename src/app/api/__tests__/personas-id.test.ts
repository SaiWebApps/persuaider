/**
 * @jest-environment node
 */

/**
 * Tests for /api/personas/[id] route (GET).
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockPersona = {
  findUnique: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { persona: mockPersona };
  },
}));

import { NextRequest } from 'next/server';
import { GET } from '../personas/[id]/route';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/personas/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/personas/p1');
    const res = await GET(req, createParams('p1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when persona not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findUnique.mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/personas/nonexistent');
    const res = await GET(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toMatch(/not found/i);
  });

  it('returns persona with scenario and conversations', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const personaData = {
      id: 'p1',
      name: 'Alex',
      description: 'Tough negotiator',
      roleType: 'Skeptic',
      scenario: { id: 's1', title: 'Salary Negotiation' },
      conversations: [
        { id: 'c1', status: 'completed', startedAt: new Date(), completedAt: new Date() },
        { id: 'c2', status: 'in_progress', startedAt: new Date(), completedAt: null },
      ],
    };
    mockPersona.findUnique.mockResolvedValue(personaData);

    const req = new NextRequest('http://localhost/api/personas/p1');
    const res = await GET(req, createParams('p1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.persona.id).toBe('p1');
    expect(data.persona.name).toBe('Alex');
    expect(data.persona.scenario.title).toBe('Salary Negotiation');
    expect(data.persona.conversations).toHaveLength(2);
  });

  it('passes correct id to prisma findUnique', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findUnique.mockResolvedValue({ id: 'target-id' });

    const req = new NextRequest('http://localhost/api/personas/target-id');
    await GET(req, createParams('target-id'));
    expect(mockPersona.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'target-id' } })
    );
  });

  it('includes scenario select with id and title', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockPersona.findUnique.mockResolvedValue({ id: 'p1' });

    const req = new NextRequest('http://localhost/api/personas/p1');
    await GET(req, createParams('p1'));
    expect(mockPersona.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          scenario: expect.objectContaining({
            select: { id: true, title: true },
          }),
        }),
      })
    );
  });
});
