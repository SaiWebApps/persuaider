/**
 * @jest-environment node
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockPersona = {
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockRole = {
  findUnique: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { persona: mockPersona, role: mockRole };
  },
}));

import { NextRequest } from 'next/server';
import { PATCH } from '../personas/[id]/route';

function makePatchRequest(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/personas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const MOCK_PERSONA = {
  id: 'p1',
  scenarioId: 's1',
  name: 'Test Persona',
  description: 'A test persona',
  roleType: 'negotiator',
  characteristics: null,
  avatarUrl: null,
  scenario: { id: 's1', createdById: 'u1' },
};

describe('PATCH /api/personas/[id]', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no session', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = makePatchRequest('p1', { avatarUrl: '/uploads/test.jpg' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(401);
  });

  it('returns 403 when email not verified', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user', emailVerified: false } });
    const req = makePatchRequest('p1', { avatarUrl: '/uploads/test.jpg' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent persona', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(null);
    const req = makePatchRequest('nonexistent', { avatarUrl: '/uploads/test.jpg' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not admin and not scenario owner', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u2', role: 'user', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    const req = makePatchRequest('p1', { avatarUrl: '/uploads/test.jpg' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(403);
  });

  // --- Characteristics validation ---

  it('updates characteristics with valid data', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    mockPersona.update.mockResolvedValue({ ...MOCK_PERSONA, characteristics: '{}' });
    const req = makePatchRequest('p1', {
      characteristics: { openness: 0.7, concerns: ['price'], personality: ['assertive'], roleBehavior: 'Be firm' },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
  });

  it('returns 400 when openness is 1.5 (out of range)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    const req = makePatchRequest('p1', { characteristics: { openness: 1.5 } });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when openness is -0.1 (negative)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    const req = makePatchRequest('p1', { characteristics: { openness: -0.1 } });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when openness is NaN', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    const req = makePatchRequest('p1', { characteristics: { openness: 'not-a-number' } });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when concerns is not an array', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    const req = makePatchRequest('p1', { characteristics: { concerns: 'not-array' } });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when concerns has 21 items', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    const concerns = Array.from({ length: 21 }, (_, i) => `concern-${i}`);
    const req = makePatchRequest('p1', { characteristics: { concerns } });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when characteristics is a string instead of object', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    const req = makePatchRequest('p1', { characteristics: 'invalid' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  // --- AvatarUrl validation ---

  it('returns 400 when avatarUrl does not start with /uploads/', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    const req = makePatchRequest('p1', { avatarUrl: 'http://evil.com/malware.jpg' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  it('allows avatarUrl = null to clear avatar', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    mockPersona.update.mockResolvedValue({ ...MOCK_PERSONA, avatarUrl: null });
    const req = makePatchRequest('p1', { avatarUrl: null });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
  });

  it('accepts valid avatarUrl starting with /uploads/', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    mockPersona.update.mockResolvedValue({ ...MOCK_PERSONA, avatarUrl: '/uploads/avatar.png' });
    const req = makePatchRequest('p1', { avatarUrl: '/uploads/avatar.png' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
  });

  // --- RoleId validation ---

  it('returns 400 when roleId points to non-existent role', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    mockRole.findUnique.mockResolvedValue(null);
    const req = makePatchRequest('p1', { roleId: 'nonexistent-role' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when roleId points to role in different scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    mockRole.findUnique.mockResolvedValue({ id: 'r1', scenarioId: 'other-scenario' });
    const req = makePatchRequest('p1', { roleId: 'r1' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(400);
  });

  it('accepts valid roleId belonging to same scenario', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'admin', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    mockRole.findUnique.mockResolvedValue({ id: 'r1', scenarioId: 's1' });
    mockPersona.update.mockResolvedValue({ ...MOCK_PERSONA, roleId: 'r1' });
    const req = makePatchRequest('p1', { roleId: 'r1' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
  });

  // --- Scenario owner access ---

  it('allows scenario owner (non-admin) to update persona', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1', role: 'user', emailVerified: true } });
    mockPersona.findUnique.mockResolvedValue(MOCK_PERSONA);
    mockPersona.update.mockResolvedValue({ ...MOCK_PERSONA, initialGreeting: 'Hello!' });
    const req = makePatchRequest('p1', { initialGreeting: 'Hello!' });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
  });
});
