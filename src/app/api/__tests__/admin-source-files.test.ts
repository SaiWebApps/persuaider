/**
 * @jest-environment node
 */

/**
 * Tests for /api/admin/scenarios/[id]/source-files routes (GET, POST, DELETE).
 */

const mockRequireAdmin = jest.fn();
jest.mock('@/lib/auth/admin', () => ({
  requireAdmin: () => mockRequireAdmin(),
}));
const mockScenario = {
  findUnique: jest.fn(),
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

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { GET, POST, DELETE } from '../admin/scenarios/[id]/source-files/route';
import { NextRequest, NextResponse } from 'next/server';

function createParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function createGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/scenarios/s1/source-files', {
    method: 'GET',
  });
}

function createDeleteRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/scenarios/s1/source-files', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function createUploadRequest(file: File): NextRequest {
  const formData = new FormData();
  formData.append('file', file);
  return new NextRequest('http://localhost/api/admin/scenarios/s1/source-files', {
    method: 'POST',
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// Auth tests
// ---------------------------------------------------------------------------
describe('GET /api/admin/scenarios/[id]/source-files — Auth', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 for non-admin', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const req = createGetRequest();
    const res = await GET(req, createParams('s1'));
    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const req = createGetRequest();
    const res = await GET(req, createParams('s1'));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET tests
// ---------------------------------------------------------------------------
describe('GET /api/admin/scenarios/[id]/source-files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
  });

  it('returns file list for existing scenario', async () => {
    mockScenario.findUnique.mockResolvedValue({ id: 's1' });
    mockSourceFile.findMany.mockResolvedValue([
      { id: 'f1', filename: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 1024 },
      { id: 'f2', filename: 'img.png', mimeType: 'image/png', sizeBytes: 512 },
    ]);
    const req = createGetRequest();
    const res = await GET(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.files).toHaveLength(2);
  });

  it('returns 404 for non-existent scenario', async () => {
    mockScenario.findUnique.mockResolvedValue(null);
    const req = createGetRequest();
    const res = await GET(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST tests
// ---------------------------------------------------------------------------
describe('POST /api/admin/scenarios/[id]/source-files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockScenario.findUnique.mockResolvedValue({ id: 's1' });
    mockSourceFile.count.mockResolvedValue(0);
    mockSourceFile.create.mockImplementation(({ data }) => {
      return Promise.resolve({ id: 'f-new', ...data });
    });
  });

  it('accepts valid PDF upload', async () => {
    const file = new File(['pdf content'], 'document.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.file.filename).toBe('document.pdf');
    expect(data.file.mimeType).toBe('application/pdf');
  });

  it('rejects file > 10MB', async () => {
    // Create a large buffer
    const largeContent = new Uint8Array(11 * 1024 * 1024);
    const file = new File([largeContent], 'huge.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('too large');
  });

  it('rejects unsupported MIME type', async () => {
    const file = new File(['content'], 'doc.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const req = createUploadRequest(file);
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Unsupported file type');
  });

  it('sanitizes path traversal filename', async () => {
    const file = new File(['content'], '../../etc/passwd', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req, createParams('s1'));
    expect(res.status).toBe(201);
    const data = await res.json();
    // Should not contain path traversal
    expect(data.file.filename).not.toContain('..');
    expect(data.file.filename).not.toContain('/');
  });

  it('returns 404 for non-existent scenario', async () => {
    mockScenario.findUnique.mockResolvedValue(null);
    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req, createParams('nonexistent'));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE tests
// ---------------------------------------------------------------------------
describe('DELETE /api/admin/scenarios/[id]/source-files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
  });

  it('deletes valid file', async () => {
    mockSourceFile.findFirst.mockResolvedValue({
      id: 'f1',
      scenarioId: 's1',
      storagePath: 'uploads/scenarios/abc123.pdf',
    });
    mockSourceFile.delete.mockResolvedValue({ id: 'f1' });
    const req = createDeleteRequest({ fileId: 'f1' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('returns 404 for non-existent file', async () => {
    mockSourceFile.findFirst.mockResolvedValue(null);
    const req = createDeleteRequest({ fileId: 'nonexistent' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-admin', async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const req = createDeleteRequest({ fileId: 'f1' });
    const res = await DELETE(req, createParams('s1'));
    expect(res.status).toBe(403);
  });
});
