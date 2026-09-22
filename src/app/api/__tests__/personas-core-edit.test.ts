/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));

const mockPersona = { findUnique: jest.fn(), update: jest.fn() };
jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { persona: mockPersona, role: { findUnique: jest.fn() } };
  },
}));

import { NextRequest } from 'next/server';
import { PATCH } from '../personas/[id]/route';

const params = { params: Promise.resolve({ id: 'persona-1' }) };
const request = (body: unknown) => new NextRequest('http://localhost/api/personas/persona-1', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const persona = {
  id: 'persona-1',
  scenarioId: 'scenario-1',
  name: 'Lou',
  description: 'Firm.',
  roleType: 'Landlord',
  initialGreeting: 'Hello.',
  scenario: { id: 'scenario-1', createdById: 'owner-1' },
};

describe('PATCH /api/personas/[id] core Persona fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthFn.mockResolvedValue({ user: { id: 'owner-1', role: 'user', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(persona);
    mockPersona.update.mockResolvedValue(persona);
  });

  it('lets the Scenario owner edit the Persona copy used by the opponent', async () => {
    const res = await PATCH(request({
      name: 'Morgan the Owner',
      description: 'Patient and exacting.',
      initialGreeting: 'Show me a workable proposal.',
    }), params);

    expect(res.status).toBe(200);
    expect(mockPersona.update).toHaveBeenCalledWith({
      where: { id: 'persona-1' },
      data: {
        name: 'Morgan the Owner',
        description: 'Patient and exacting.',
        initialGreeting: 'Show me a workable proposal.',
      },
    });
  });

  it.each([
    [{ name: '' }, 'name'],
    [{ description: 'x'.repeat(5001) }, 'description'],
    [{ initialGreeting: 42 }, 'initialGreeting'],
  ])('rejects invalid core Persona copy: %p', async (body, field) => {
    const res = await PATCH(request(body), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(field);
    expect(mockPersona.update).not.toHaveBeenCalled();
  });
});
