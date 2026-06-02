import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'scenarios');

/**
 * Sanitize a filename: strip path components, limit to safe chars, truncate.
 */
function sanitizeFilename(filename: string): string {
  // Strip any path components (path traversal prevention)
  const basename = path.basename(filename);
  // Keep only alphanumeric, dots, hyphens, underscores
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Truncate to 200 chars
  return sanitized.slice(0, 200);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  // Verify scenario exists
  const scenario = await prisma.scenario.findUnique({ where: { id } });
  if (!scenario) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  }

  const files = await prisma.sourceFile.findMany({
    where: { scenarioId: id },
    orderBy: { displayOrder: 'asc' },
  });

  return NextResponse.json({ files });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  // Verify scenario exists
  const scenario = await prisma.scenario.findUnique({ where: { id } });
  if (!scenario) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size: 10MB` },
      { status: 400 }
    );
  }

  // Sanitize filename and generate unique storage name
  const safeName = sanitizeFilename(file.name);
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(safeName) || '.bin';
  const storageName = `${uniqueId}${ext}`;
  const storagePath = `uploads/scenarios/${storageName}`;
  const fullPath = path.join(UPLOAD_DIR, storageName);

  // Ensure upload directory exists
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  // Write file to disk
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buffer);

  // Get current file count for display order
  const fileCount = await prisma.sourceFile.count({ where: { scenarioId: id } });

  // Create database record
  const sourceFile = await prisma.sourceFile.create({
    data: {
      scenarioId: id,
      filename: safeName,
      storagePath,
      mimeType: file.type,
      sizeBytes: file.size,
      displayOrder: fileCount,
    },
  });

  return NextResponse.json({ file: sourceFile }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const body = await request.json();
  const { fileId } = body;

  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  // Find the file record
  const sourceFile = await prisma.sourceFile.findFirst({
    where: { id: fileId, scenarioId: id },
  });

  if (!sourceFile) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Delete file from disk (ignore errors if file doesn't exist)
  const fullPath = path.join(process.cwd(), 'public', sourceFile.storagePath);
  try {
    await fs.unlink(fullPath);
  } catch {
    // File may have already been deleted
  }

  // Delete database record
  await prisma.sourceFile.delete({ where: { id: fileId } });

  return NextResponse.json({ success: true });
}
