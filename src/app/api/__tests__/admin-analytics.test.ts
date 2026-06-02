/**
 * @jest-environment node
 */

const mockClerkAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockClerkAuth(),
  currentUser: jest.fn(),
}));

const mockUserFindUnique = jest.fn();
const mockConversation = {
  count: jest.fn(),
  findMany: jest.fn(),
};
const mockSummary = {
  aggregate: jest.fn(),
  findMany: jest.fn(),
};
const mockUser = {
  findMany: jest.fn(),
  findUnique: mockUserFindUnique,
};
const mockScenario = {
  findMany: jest.fn(),
};

jest.mock('@/lib/db/client', () => ({
  get prisma() {
    return {
      conversation: mockConversation,
      summary: mockSummary,
      user: mockUser,
      scenario: mockScenario,
    };
  },
}));

import { GET } from '../admin/analytics/route';

function mockAdmin() {
  mockClerkAuth.mockResolvedValue({ userId: 'clerk-1', sessionClaims: { metadata: { role: 'admin' } } });
  mockUserFindUnique.mockResolvedValue({ id: 'u1', role: 'admin' });
}

function mockNonAdmin() {
  mockClerkAuth.mockResolvedValue({ userId: 'clerk-1', sessionClaims: { metadata: { role: 'user' } } });
  mockUserFindUnique.mockResolvedValue({ id: 'u1', role: 'user' });
}

function mockNoAuth() {
  mockClerkAuth.mockResolvedValue({ userId: null, sessionClaims: null });
}

describe('GET /api/admin/analytics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockNoAuth();
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockNonAdmin();
    const response = await GET();
    expect(response.status).toBe(403);
  });

  it('returns correct stats with zero conversations', async () => {
    mockAdmin();
    mockConversation.count.mockResolvedValue(0);
    mockSummary.aggregate.mockResolvedValue({ _avg: { overallScore: null } });
    mockSummary.findMany.mockResolvedValue([]);
    mockUser.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.overview.totalConversations).toBe(0);
    expect(data.overview.completedConversations).toBe(0);
    expect(data.overview.completionRate).toBe(0);
    expect(data.overview.averageScore).toBeNull();
    expect(data.scoresOverTime).toEqual([]);
    expect(data.perUser).toEqual([]);
    expect(data.perScenario).toEqual([]);
  });

  it('calculates completion rate correctly', async () => {
    mockAdmin();
    mockConversation.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(7);
    mockSummary.aggregate.mockResolvedValue({ _avg: { overallScore: 75 } });
    mockSummary.findMany.mockResolvedValue([]);
    mockUser.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();
    expect(data.overview.totalConversations).toBe(10);
    expect(data.overview.completedConversations).toBe(7);
    expect(data.overview.completionRate).toBe(0.7);
  });

  it('returns correct average score excluding nulls', async () => {
    mockAdmin();
    mockConversation.count.mockResolvedValue(5);
    mockSummary.aggregate.mockResolvedValue({ _avg: { overallScore: 82.5 } });
    mockSummary.findMany.mockResolvedValue([]);
    mockUser.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();
    expect(data.overview.averageScore).toBe(82.5);
  });

  it('groups scores by week correctly', async () => {
    mockAdmin();
    mockConversation.count.mockResolvedValue(3);
    mockSummary.aggregate.mockResolvedValue({ _avg: { overallScore: 80 } });
    mockSummary.findMany.mockResolvedValue([
      { overallScore: 80, generatedAt: new Date("2026-01-06T10:00:00Z") },
      { overallScore: 90, generatedAt: new Date("2026-01-07T10:00:00Z") },
      { overallScore: 70, generatedAt: new Date("2026-01-13T10:00:00Z") },
    ]);
    mockUser.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();
    expect(data.scoresOverTime).toHaveLength(2);
    expect(data.scoresOverTime[0].count).toBe(2);
    expect(data.scoresOverTime[0].avgScore).toBe(85);
    expect(data.scoresOverTime[1].count).toBe(1);
    expect(data.scoresOverTime[1].avgScore).toBe(70);
  });

  it('aggregates per-user stats correctly', async () => {
    mockAdmin();
    mockConversation.count.mockResolvedValue(3);
    mockSummary.aggregate.mockResolvedValue({ _avg: { overallScore: 75 } });
    mockSummary.findMany.mockResolvedValue([]);
    mockUser.findMany.mockResolvedValue([
      {
        id: 'u1',
        username: 'Alice',
        conversations: [
          { id: 'c1', status: 'completed', summary: { overallScore: 80 } },
          { id: 'c2', status: 'completed', summary: { overallScore: 90 } },
          { id: 'c3', status: 'in_progress', summary: null },
        ],
      },
      {
        id: 'u2',
        username: 'Bob',
        conversations: [
          { id: 'c4', status: 'completed', summary: { overallScore: 60 } },
        ],
      },
    ]);
    mockScenario.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();
    expect(data.perUser).toHaveLength(2);
    const alice = data.perUser.find((u: { username: string }) => u.username === "Alice");
    expect(alice.totalConversations).toBe(3);
    expect(alice.completedConversations).toBe(2);
    expect(alice.averageScore).toBe(85);
    const bob = data.perUser.find((u: { username: string }) => u.username === "Bob");
    expect(bob.totalConversations).toBe(1);
    expect(bob.averageScore).toBe(60);
  });

  it('aggregates per-scenario stats correctly', async () => {
    mockAdmin();
    mockConversation.count.mockResolvedValue(2);
    mockSummary.aggregate.mockResolvedValue({ _avg: { overallScore: 70 } });
    mockSummary.findMany.mockResolvedValue([]);
    mockUser.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'Salary Negotiation',
        conversations: [
          { id: 'c1', status: 'completed', summary: { overallScore: 70 } },
          { id: 'c2', status: 'completed', summary: { overallScore: 80 } },
        ],
      },
      {
        id: 's2',
        title: 'Car Deal',
        conversations: [
          { id: 'c3', status: 'in_progress', summary: null },
        ],
      },
    ]);

    const response = await GET();
    const data = await response.json();
    expect(data.perScenario).toHaveLength(2);
    const salary = data.perScenario.find((s: { title: string }) => s.title === "Salary Negotiation");
    expect(salary.totalConversations).toBe(2);
    expect(salary.completedConversations).toBe(2);
    expect(salary.averageScore).toBe(75);
    const car = data.perScenario.find((s: { title: string }) => s.title === "Car Deal");
    expect(car.totalConversations).toBe(1);
    expect(car.completedConversations).toBe(0);
    expect(car.averageScore).toBeNull();
  });

  it('handles user with no scored conversations', async () => {
    mockAdmin();
    mockConversation.count.mockResolvedValue(1);
    mockSummary.aggregate.mockResolvedValue({ _avg: { overallScore: null } });
    mockSummary.findMany.mockResolvedValue([]);
    mockUser.findMany.mockResolvedValue([
      {
        id: 'u1',
        username: 'NoScores',
        conversations: [
          { id: 'c1', status: 'in_progress', summary: null },
        ],
      },
    ]);
    mockScenario.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();
    expect(data.perUser[0].averageScore).toBeNull();
  });

  it('handles scenario with all null scores', async () => {
    mockAdmin();
    mockConversation.count.mockResolvedValue(2);
    mockSummary.aggregate.mockResolvedValue({ _avg: { overallScore: null } });
    mockSummary.findMany.mockResolvedValue([]);
    mockUser.findMany.mockResolvedValue([]);
    mockScenario.findMany.mockResolvedValue([
      {
        id: 's1',
        title: 'New Scenario',
        conversations: [
          { id: 'c1', status: 'completed', summary: { overallScore: null } },
          { id: 'c2', status: 'in_progress', summary: null },
        ],
      },
    ]);

    const response = await GET();
    const data = await response.json();
    expect(data.perScenario[0].averageScore).toBeNull();
  });
});