import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { generateScenarioFromDocument } from '@/lib/llm/generation';
import { assertWithinBudget } from '@/lib/llm/usage';
import { BudgetExceededError } from '@/types';
import { isSupportedMimeType } from '@/lib/documents/extract';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check email verification
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true },
  });
  if (!currentUser || !currentUser.emailVerified) {
    return NextResponse.json({ error: 'Email not verified' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!isSupportedMimeType(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type: ' + file.type + '. Supported: PDF, JPEG, PNG, WebP' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await assertWithinBudget(session.user.id);
    const scenario = await generateScenarioFromDocument(buffer, file.type, file.name, { userId: session.user.id, purpose: 'generation' });
    return NextResponse.json({ scenario }, { status: 200 });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return NextResponse.json({ error: error.message, code: 'budget_exceeded' }, { status: 429 });
    }
    console.error('Document scenario generation failed:', error);

    const message = error instanceof Error ? error.message : '';
    if (message.includes('Could not extract text')) {
      return NextResponse.json(
        { error: 'Could not extract text from document' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Generation failed. Please try again.' },
      { status: 502 }
    );
  }
}
