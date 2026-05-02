/**
 * @jest-environment node
 */

/**
 * Tests for /api/upload/image route (POST).
 */

const mockAuthFn = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}));

const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockExistsSync = jest.fn();

jest.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

import { NextRequest } from 'next/server';
import { POST } from '../upload/image/route';

function createUploadRequest(file: File | null): NextRequest {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  return new NextRequest('http://localhost/api/upload/image', {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/upload/image', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null);
    const file = new File(['data'], 'test.png', { type: 'image/png' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when no file is provided', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const req = createUploadRequest(null);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/no file/i);
  });

  it('returns 400 for invalid file type (application/pdf)', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid file type/i);
  });

  it('returns 400 for file exceeding 2MB', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    // Create a buffer larger than 2MB
    const largeContent = new Uint8Array(2 * 1024 * 1024 + 1);
    const file = new File([largeContent], 'big.png', { type: 'image/png' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/too large/i);
  });

  it('uploads JPEG file successfully', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const file = new File(['image-data'], 'photo.jpg', { type: 'image/jpeg' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.url).toMatch(/^\/uploads\//);
    expect(data.filename).toContain('photo');
    expect(data.filename).toMatch(/\.jpg$/);
  });

  it('uploads PNG file successfully', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const file = new File(['image-data'], 'screenshot.png', { type: 'image/png' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.filename).toMatch(/\.png$/);
  });

  it('uploads WebP file successfully', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const file = new File(['image-data'], 'image.webp', { type: 'image/webp' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('sanitizes filename by removing special characters', async () => {
    mockAuthFn.mockResolvedValue({ user: { id: 'u1' } });
    const file = new File(['data'], 'my file (1) @copy!.png', { type: 'image/png' });
    const req = createUploadRequest(file);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.filename).not.toMatch(/[\s()@!]/);
    expect(data.filename).toMatch(/\.png$/);
  });
});
