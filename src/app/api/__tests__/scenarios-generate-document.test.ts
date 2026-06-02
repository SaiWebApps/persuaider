/**
 * @jest-environment node
 */

/**
 * Tests for POST /api/scenarios/generate-from-document
 */

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

const mockGenerateScenarioFromDocument = jest.fn();
jest.mock('@/lib/llm/generation', () => ({
  generateScenarioFromDocument: (...args: unknown[]) => mockGenerateScenarioFromDocument(...args),
}));

jest.mock('@/lib/documents/extract', () => ({
  isSupportedMimeType: (type: string) => ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(type),
}));

import { NextRequest } from 'next/server';
import { POST } from '../scenarios/generate-from-document/route';

function createUploadRequest(file: File | null): NextRequest {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  return new NextRequest('http://localhost/api/scenarios/generate-from-document', {
    method: 'POST',
    body: formData,
  });
}

const MOCK_SCENARIO = {
  title: 'Contract Negotiation',
  description: 'Negotiate contract terms',
  userRole: 'Contractor',
  aiRole: 'Client',
  initialGreeting: 'Lets discuss the terms.',
  evaluationCriteria: { frameworks: [], scoringInstructions: 'test' },
  winCondition: { type: 'manual', maxMessages: 20 },
  roles: [],
  personas: [],
};

describe('POST /api/scenarios/generate-from-document', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const file = new File(['pdf-content'], 'contract.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when email is not verified', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: false });
    const file = new File(['pdf-content'], 'contract.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 when no file in FormData', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    const req = createUploadRequest(null);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no file/i);
  });

  it('returns 400 for unsupported file type (text/plain)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    const file = new File(['plain text'], 'readme.txt', { type: 'text/plain' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Unsupported file type');
  });

  it('returns 400 for file exceeding 10MB', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    // Create a buffer larger than 10MB
    const largeContent = new Uint8Array(10 * 1024 * 1024 + 1);
    const file = new File([largeContent], 'huge.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/too large/i);
  });

  it('returns 200 with scenario for valid PDF', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenarioFromDocument.mockResolvedValue(MOCK_SCENARIO);
    const file = new File(['pdf-content'], 'contract.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.scenario).toEqual(MOCK_SCENARIO);
    expect(mockGenerateScenarioFromDocument).toHaveBeenCalledWith(
      expect.any(Buffer),
      'application/pdf',
      'contract.pdf'
    );
  });

  it('returns 400 when document has no extractable text', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenarioFromDocument.mockRejectedValue(
      new Error('Could not extract text from document')
    );
    const file = new File(['empty-pdf'], 'blank.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Could not extract text');
  });

  it('returns 502 when LLM fails after successful extraction', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenarioFromDocument.mockRejectedValue(new Error('LLM timeout'));
    const file = new File(['pdf-content'], 'doc.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain('Generation failed');
  });

  it('returns 200 for valid JPEG image', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenarioFromDocument.mockResolvedValue(MOCK_SCENARIO);
    const file = new File(['image-data'], 'whiteboard.jpg', { type: 'image/jpeg' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 for valid PNG image', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    mockUser.findUnique.mockResolvedValue({ emailVerified: true });
    mockGenerateScenarioFromDocument.mockResolvedValue(MOCK_SCENARIO);
    const file = new File(['image-data'], 'screenshot.png', { type: 'image/png' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
