/**
 * @jest-environment node
 */
const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({ auth: () => mockAuthFn() }));
const mockScenario = { findUnique: jest.fn(), update: jest.fn() };
const mockRole = { update: jest.fn() };
const mockPersona = { updateMany: jest.fn() };
const tx = { role: mockRole, scenario: mockScenario, persona: mockPersona };
jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { scenario: mockScenario, role: mockRole, $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
  },
}));

import { NextRequest } from 'next/server';
import { PATCH } from '../scenarios/[id]/route';

const params = { params: Promise.resolve({ id: 's1' }) };
const req = (body: unknown) => new NextRequest('http://localhost/api/scenarios/s1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const scenario = {
  id: 's1', createdById: 'owner', title: 'T', description: 'D', userRole: 'u', aiRole: 'a', visibility: 'unlisted', joinCode: 'J', learnerRoleId: 'r-buyer',
  issues: JSON.stringify([{ name: 'Price', unit: 'USD', learnerWants: 'lower', learner: { target: 7000, reservation: 8500, weight: 100 }, counterpart: { target: 9500, reservation: 8000, weight: 100 } }]),
  roles: [{ id: 'r-buyer', name: 'Buyer', description: 'A', displayOrder: 1 }, { id: 'r-seller', name: 'Seller', description: 'B', displayOrder: 2 }],
  personas: [{ id: 'p1', name: 'Sam', roleId: 'r-seller' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockScenario.findUnique.mockResolvedValue(scenario);
  mockScenario.update.mockResolvedValue({});
  mockRole.update.mockResolvedValue({});
});

describe('PATCH /api/scenarios/[id]', () => {
  it('a non-creator gets 404 and nothing is written', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'stranger', role: 'user' } });
    expect((await PATCH(req({ title: 'x' }), params)).status).toBe(404);
    expect(mockScenario.update).not.toHaveBeenCalled();
  });
  it('rejects issues whose numbers contradict their direction, naming the field', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'owner', role: 'user' } });
    const res = await PATCH(req({ issues: [{ name: 'Price', learnerWants: 'lower', learner: { target: 9000, reservation: 8500, weight: 100 }, counterpart: { target: 9500, reservation: 8000, weight: 100 } }] }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('learner target');
  });
  it('rejects putting the learner on a side a persona plays, or an unknown role id', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'owner', role: 'user' } });
    expect((await PATCH(req({ learnerRoleId: 'r-seller' }), params)).status).toBe(400);
    expect((await PATCH(req({ roles: [{ id: 'r-nope', name: 'X', description: '' }] }), params)).status).toBe(400);
  });
  it('updates briefs, visibility, learner side and issues in one transaction', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'owner', role: 'user' } });
    const res = await PATCH(req({
      visibility: 'public',
      roles: [{ id: 'r-buyer', name: 'Buyer', description: 'new brief' }],
      learnerRoleId: 'r-buyer',
      issues: [{ name: 'Price', unit: 'USD', learnerWants: 'lower', learner: { target: 7000, reservation: 8600, weight: 100 }, counterpart: { target: 9500, reservation: 8000, weight: 100 } }],
    }), params);
    expect(res.status).toBe(200);
    expect(mockRole.update).toHaveBeenCalledWith({ where: { id: 'r-buyer' }, data: { name: 'Buyer', description: 'new brief' } });
    expect(mockScenario.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' }, data: expect.objectContaining({ visibility: 'public', learnerRoleId: 'r-buyer' }) }));
    expect(JSON.parse(mockScenario.update.mock.calls[0][0].data.issues)[0].learner.reservation).toBe(8600);
  });
  it('renaming a side also renames the persona roleType and the scenario side labels the prompt reads', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'owner', role: 'user' } });
    mockPersona.updateMany.mockResolvedValue({ count: 1 });
    const res = await PATCH(req({ roles: [{ id: 'r-seller', name: 'Owner', description: 'B' }] }), params);
    expect(res.status).toBe(200);
    expect(mockPersona.updateMany).toHaveBeenCalledWith({ where: { roleId: 'r-seller' }, data: { roleType: 'Owner' } });
    expect(mockScenario.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ aiRole: 'Owner' }) }));
  });

  it('an admin may edit anyone\'s scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'someone', role: 'admin' } });
    expect((await PATCH(req({ title: 'Renamed' }), params)).status).toBe(200);
  });
});
