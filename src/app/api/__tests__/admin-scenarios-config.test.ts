/**
 * @jest-environment node
 */

/**
 * Tests for PATCH /api/admin/scenarios/[id] — evaluationCriteria, winCondition,
 * contextNotes, tags, visibility, and status transition validation.
 */

const mockRequireAdmin = jest.fn();
jest.mock('@/lib/auth/admin', () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

const mockScenario = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockSourceFile = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      scenario: mockScenario,
      sourceFile: mockSourceFile,
    };
  },
}));

import { PATCH } from '../admin/scenarios/[id]/route';
import { NextRequest, NextResponse } from 'next/server';

const deny401 = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const deny403 = NextResponse.json({ error: 'Forbidden' }, { status: 403 });

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/scenarios/s1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const validEvalCriteria = {
  frameworks: [
    {
      name: 'Negotiation Tactics',
      description: 'How well the user negotiates',
      elements: [
        { name: 'Opening', description: 'Strong opening position' },
        { name: 'Concessions', description: 'Strategic concessions' },
      ],
      weight: 50,
    },
  ],
  scoringInstructions: 'Score based on overall effectiveness',
};

const existingDraftScenario = {
  id: 's1',
  title: 'Test Scenario',
  status: 'draft',
  evaluationCriteria: '{}',
  winCondition: '{"type":"manual","maxMessages":30}',
  tags: '[]',
  visibility: 'public',
};

const existingPublishedScenario = {
  ...existingDraftScenario,
  status: 'published',
};

const existingArchivedScenario = {
  ...existingDraftScenario,
  status: 'archived',
};

// ---------------------------------------------------------------------------
// Auth tests
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/scenarios/[id] — Auth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue(deny401);
    const req = createRequest({ title: 'Updated' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockRequireAdmin.mockResolvedValue(deny403);
    const req = createRequest({ title: 'Updated' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent scenario', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue(null);
    const req = createRequest({ title: 'Updated' });
    const res = await PATCH(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// EvaluationCriteria tests
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/scenarios/[id] — evaluationCriteria', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue(existingDraftScenario);
    mockScenario.update.mockImplementation(({ data }) => {
      return Promise.resolve({
        ...existingDraftScenario,
        ...data,
      });
    });
  });

  it('accepts valid evaluationCriteria', async () => {
    const req = createRequest({ evaluationCriteria: validEvalCriteria });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenario.evaluationCriteria.frameworks).toHaveLength(1);
  });

  it('rejects evaluationCriteria as raw string', async () => {
    const req = createRequest({ evaluationCriteria: '{"frameworks":[]}' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('object, not a string');
  });

  it('accepts evaluationCriteria with empty frameworks array', async () => {
    const req = createRequest({
      evaluationCriteria: { frameworks: [], scoringInstructions: '' },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('rejects evaluationCriteria with framework missing name', async () => {
    const req = createRequest({
      evaluationCriteria: {
        frameworks: [{ description: 'test', elements: [], weight: 50 }],
      },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('name must be a string');
  });

  it('rejects evaluationCriteria with framework name > 100 chars', async () => {
    const req = createRequest({
      evaluationCriteria: {
        frameworks: [
          { name: 'x'.repeat(101), description: 'test', elements: [], weight: 50 },
        ],
      },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('1-100 chars');
  });

  it('accepts evaluationCriteria with deeply nested elements (100 items)', async () => {
    const elements = Array.from({ length: 100 }, (_, i) => ({
      name: `Element ${i}`,
      description: `Description ${i}`,
    }));
    const req = createRequest({
      evaluationCriteria: {
        frameworks: [{ name: 'Deep', description: 'test', elements, weight: 50 }],
        scoringInstructions: 'Score well',
      },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('rejects evaluationCriteria with framework.weight = -1', async () => {
    const req = createRequest({
      evaluationCriteria: {
        frameworks: [{ name: 'Bad', description: 'test', elements: [], weight: -1 }],
      },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('weight');
  });

  it('rejects evaluationCriteria with framework.weight = 101', async () => {
    const req = createRequest({
      evaluationCriteria: {
        frameworks: [{ name: 'Bad', description: 'test', elements: [], weight: 101 }],
      },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('weight');
  });

  it('rejects evaluationCriteria with scoringInstructions > 2000 chars', async () => {
    const req = createRequest({
      evaluationCriteria: {
        frameworks: [],
        scoringInstructions: 'x'.repeat(2001),
      },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('scoringInstructions');
  });
});

// ---------------------------------------------------------------------------
// WinCondition tests
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/scenarios/[id] — winCondition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue(existingDraftScenario);
    mockScenario.update.mockImplementation(({ data }) => {
      return Promise.resolve({ ...existingDraftScenario, ...data });
    });
  });

  it('accepts valid score_threshold winCondition', async () => {
    const req = createRequest({
      winCondition: { type: 'score_threshold', threshold: 75, maxMessages: 20 },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('accepts valid manual winCondition', async () => {
    const req = createRequest({
      winCondition: { type: 'manual', maxMessages: 30 },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('rejects score_threshold without threshold', async () => {
    const req = createRequest({
      winCondition: { type: 'score_threshold' },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('threshold');
  });

  it('rejects winCondition with threshold = 0', async () => {
    const req = createRequest({
      winCondition: { type: 'score_threshold', threshold: 0 },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
  });

  it('rejects winCondition with threshold = 101', async () => {
    const req = createRequest({
      winCondition: { type: 'score_threshold', threshold: 101 },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
  });

  it('rejects winCondition with maxMessages = 0', async () => {
    const req = createRequest({
      winCondition: { type: 'manual', maxMessages: 0 },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
  });

  it('rejects winCondition with maxMessages = -1', async () => {
    const req = createRequest({
      winCondition: { type: 'manual', maxMessages: -1 },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
  });

  it('rejects winCondition with maxMessages = 101', async () => {
    const req = createRequest({
      winCondition: { type: 'manual', maxMessages: 101 },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
  });

  it('rejects winCondition with invalid type', async () => {
    const req = createRequest({
      winCondition: { type: 'invalid_type' },
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('type');
  });
});

// ---------------------------------------------------------------------------
// contextNotes tests
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/scenarios/[id] — contextNotes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue(existingDraftScenario);
    mockScenario.update.mockImplementation(({ data }) => {
      return Promise.resolve({ ...existingDraftScenario, ...data });
    });
  });

  it('accepts contextNotes with XSS content (stored as-is, frontend escapes)', async () => {
    const req = createRequest({
      contextNotes: '<script>alert(1)</script>',
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('rejects contextNotes > 5000 chars', async () => {
    const req = createRequest({
      contextNotes: 'x'.repeat(5001),
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('5000');
  });

  it('accepts contextNotes = null (clears field)', async () => {
    const req = createRequest({ contextNotes: null });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
    expect(mockScenario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contextNotes: null }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Tags tests
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/scenarios/[id] — tags', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue(existingDraftScenario);
    mockScenario.update.mockImplementation(({ data }) => {
      return Promise.resolve({ ...existingDraftScenario, ...data });
    });
  });

  it('accepts valid tags', async () => {
    const req = createRequest({ tags: ['negotiation', 'sales'] });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('rejects tags with 11 items', async () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const req = createRequest({ tags });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('10');
  });

  it('rejects tags with item > 50 chars', async () => {
    const req = createRequest({ tags: ['x'.repeat(51)] });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('50');
  });

  it('rejects tags with duplicate (case-insensitive)', async () => {
    const req = createRequest({ tags: ['Sales', 'sales'] });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('duplicate');
  });

  it('accepts empty tags array (clear tags)', async () => {
    const req = createRequest({ tags: [] });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Visibility tests
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/scenarios/[id] — visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue(existingDraftScenario);
    mockScenario.update.mockImplementation(({ data }) => {
      return Promise.resolve({ ...existingDraftScenario, ...data });
    });
  });

  it('accepts visibility = "public"', async () => {
    const req = createRequest({ visibility: 'public' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('accepts visibility = "unlisted"', async () => {
    const req = createRequest({ visibility: 'unlisted' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('rejects visibility = "private" (invalid)', async () => {
    const req = createRequest({ visibility: 'private' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('visibility');
  });
});

// ---------------------------------------------------------------------------
// Status transition tests
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/scenarios/[id] — status transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
  });

  it('allows draft -> published', async () => {
    mockScenario.findUnique.mockResolvedValue(existingDraftScenario);
    mockScenario.update.mockImplementation(({ data }) => {
      return Promise.resolve({ ...existingDraftScenario, ...data });
    });
    const req = createRequest({ status: 'published' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('allows published -> archived', async () => {
    mockScenario.findUnique.mockResolvedValue(existingPublishedScenario);
    mockScenario.update.mockImplementation(({ data }) => {
      return Promise.resolve({ ...existingPublishedScenario, ...data });
    });
    const req = createRequest({ status: 'archived' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
  });

  it('rejects published -> draft (backward transition)', async () => {
    mockScenario.findUnique.mockResolvedValue(existingPublishedScenario);
    const req = createRequest({ status: 'draft' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid status transition');
  });

  it('rejects archived -> published (backward transition)', async () => {
    mockScenario.findUnique.mockResolvedValue(existingArchivedScenario);
    const req = createRequest({ status: 'published' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid status transition');
  });

  it('rejects archived -> draft (backward transition)', async () => {
    mockScenario.findUnique.mockResolvedValue(existingArchivedScenario);
    const req = createRequest({ status: 'draft' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
  });

  it('rejects draft -> archived (skip transition)', async () => {
    mockScenario.findUnique.mockResolvedValue(existingDraftScenario);
    const req = createRequest({ status: 'archived' });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Combined field tests
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/scenarios/[id] — combined fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue(existingDraftScenario);
    mockScenario.update.mockImplementation(({ data }) => {
      return Promise.resolve({ ...existingDraftScenario, ...data });
    });
  });

  it('accepts multiple valid fields at once', async () => {
    const req = createRequest({
      evaluationCriteria: validEvalCriteria,
      winCondition: { type: 'score_threshold', threshold: 80 },
      contextNotes: 'Some notes here',
      tags: ['sales', 'advanced'],
      visibility: 'unlisted',
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(200);
    expect(mockScenario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visibility: 'unlisted',
          contextNotes: 'Some notes here',
        }),
      })
    );
  });

  it('stops at first invalid field (evaluationCriteria)', async () => {
    const req = createRequest({
      evaluationCriteria: 'invalid-string',
      tags: ['valid'],
    });
    const res = await PATCH(req, createParams('s1'));
    expect(res.status).toBe(400);
    expect(mockScenario.update).not.toHaveBeenCalled();
  });
});
