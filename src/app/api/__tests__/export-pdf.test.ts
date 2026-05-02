/**
 * @jest-environment node
 */

/**
 * Integration tests for /api/export/pdf route (GET).
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockUser = {
  findUnique: jest.fn(),
};
const mockConversation = {
  findMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      user: mockUser,
      conversation: mockConversation,
    };
  },
}));

import { GET } from '../export/pdf/route';
import { NextRequest } from 'next/server';

function createRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/export/pdf');
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url, { method: 'GET' });
}

describe('GET /api/export/pdf', () => {
  beforeEach(() => jest.clearAllMocks());

  // ---- Auth ----

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const req = createRequest();
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  // ---- No completed conversations ----

  it('returns HTML with "No completed conversations" when none exist', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'TestUser' });
    mockConversation.findMany.mockResolvedValue([]);

    const req = createRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html');
    const html = await res.text();
    expect(html).toContain('No completed conversations');
    expect(html).toContain('TestUser');
  });

  // ---- Happy path ----

  it('returns HTML report with conversation data', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'Alice' });
    mockConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        persona: { name: 'CFO Bob', description: 'Tough finance guy', roleType: 'Skeptic' },
        scenario: { title: 'Budget Negotiation' },
        summary: {
          overallScore: 75,
          winningArguments: JSON.stringify([
            { text: 'ROI projection', framework: 'Financial', element: 'Numbers', effectiveness: 8 },
          ]),
        },
        completedAt: new Date(),
      },
    ]);

    const req = createRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Alice');
    expect(html).toContain('CFO Bob');
    expect(html).toContain('Budget Negotiation');
    expect(html).toContain('75');
    expect(html).toContain('ROI projection');
  });

  it('sets Content-Disposition header with date', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'User' });
    mockConversation.findMany.mockResolvedValue([]);

    const req = createRequest();
    const res = await GET(req);
    const disposition = res.headers.get('Content-Disposition');
    expect(disposition).toContain('persuaider-report-');
    expect(disposition).toContain('.html');
  });

  // ---- Scenario filter ----

  it('filters conversations by scenarioId when provided', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'User' });
    mockConversation.findMany.mockResolvedValue([]);

    const req = createRequest({ scenarioId: 's42' });
    await GET(req);

    expect(mockConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          status: 'completed',
          scenarioId: 's42',
        }),
      })
    );
  });

  it('does not filter by scenarioId when param is absent', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'User' });
    mockConversation.findMany.mockResolvedValue([]);

    const req = createRequest();
    await GET(req);

    const callArgs = mockConversation.findMany.mock.calls[0][0];
    expect(callArgs.where.scenarioId).toBeUndefined();
  });

  // ---- Conversation without summary ----

  it('renders conversation without summary gracefully', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'User' });
    mockConversation.findMany.mockResolvedValue([
      {
        id: 'c2',
        persona: { name: 'VP', description: 'Executive', roleType: 'Decision-maker' },
        scenario: { title: 'Sales Pitch' },
        summary: null,
        completedAt: new Date(),
      },
    ]);

    const req = createRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('VP');
    expect(html).toContain('Sales Pitch');
    // No score section when summary is null
    expect(html).not.toContain('Score:');
  });

  // ---- Multiple conversations ----

  it('renders multiple conversations', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ username: 'User' });
    mockConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        persona: { name: 'P1', description: 'D1', roleType: 'R1' },
        scenario: { title: 'S1' },
        summary: { overallScore: 80, winningArguments: '[]' },
        completedAt: new Date(),
      },
      {
        id: 'c2',
        persona: { name: 'P2', description: 'D2', roleType: 'R2' },
        scenario: { title: 'S2' },
        summary: { overallScore: 60, winningArguments: '[]' },
        completedAt: new Date(),
      },
    ]);

    const req = createRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Completed Conversations:</strong> 2');
  });

  // ---- User without username ----

  it('falls back to "User" when username is null', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue(null);
    mockConversation.findMany.mockResolvedValue([]);

    const req = createRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('User');
  });
});
