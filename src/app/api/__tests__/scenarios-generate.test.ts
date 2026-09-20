/**
 * @jest-environment node
 */

/**
 * Tests for POST /api/scenarios/generate
 */

// Budget metering is tested in src/lib/llm/__tests__/usage.test.ts; routes get a permissive fake.
jest.mock('@/lib/llm/usage', () => ({
  assertWithinBudget: jest.fn().mockResolvedValue({ spentUsd: 0, calls: 0, budgetUsd: 2 }),
  recordLlmCall: jest.fn().mockResolvedValue(undefined),
  getDailyUsage: jest.fn().mockResolvedValue({ spentUsd: 0, calls: 0, budgetUsd: 2 }),
  estimatedResponse: (_m: unknown, content: string, provider: string, model: string) => ({
    content, provider, model, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  }),
}));


const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockUser = { findUnique: jest.fn() };
jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return { user: mockUser };
  },
}));

const mockGenerateScenario = jest.fn();
jest.mock('@/lib/llm/generation', () => ({
  generateScenario: (...args: unknown[]) => mockGenerateScenario(...args),
}));

import { NextRequest } from 'next/server';
import { POST } from '../scenarios/generate/route';

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/scenarios/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const MOCK_SCENARIO = {
  title: 'Test Scenario',
  description: 'A test scenario',
  userRole: 'Tester',
  aiRole: 'AI',
  initialGreeting: 'Hello',
  evaluationCriteria: { frameworks: [], scoringInstructions: 'test' },
  winCondition: { type: 'manual', maxMessages: 20 },
  roles: [],
  personas: [],
};

describe('POST /api/scenarios/generate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest({ description: 'A test scenario description' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when email is not verified', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: false });
    const req = createRequest({ description: 'A test scenario description' });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 403 when user not found', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue(null);
    const req = createRequest({ description: 'A test scenario description' });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 when description is empty', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    const req = createRequest({ description: '' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is missing', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    const req = createRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is too short (< 10 chars)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    const req = createRequest({ description: 'short' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('at least');
  });

  it('returns 400 when description exceeds 5000 chars', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    const req = createRequest({ description: 'x'.repeat(5001) });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('exceed');
  });

  it('returns 200 with scenario on successful generation', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenario.mockResolvedValue(MOCK_SCENARIO);
    const req = createRequest({ description: 'A salary negotiation with a tough manager' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenario).toEqual(MOCK_SCENARIO);
  });

  it('returns 502 when LLM returns garbage (generation throws)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenario.mockRejectedValue(new Error('Failed to parse'));
    const req = createRequest({ description: 'A valid description for testing' });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain('Generation failed');
  });

  it('returns 502 when LLM throws network error', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenario.mockRejectedValue(new Error('ECONNREFUSED'));
    const req = createRequest({ description: 'A valid description for testing' });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it('returns 502 when LLM returns empty (generation throws)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenario.mockRejectedValue(new Error('Failed to parse LLM response'));
    const req = createRequest({ description: 'A valid description for testing' });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it('handles XSS in description (passes to LLM, validates output)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenario.mockResolvedValue(MOCK_SCENARIO);
    const req = createRequest({
      description: '<script>alert("xss")</script> A negotiation scenario with details',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenario.title).toBe('Test Scenario');
  });

  it('returns 400 when description is not a string', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    const req = createRequest({ description: 12345 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
