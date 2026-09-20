import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { generateScenario } from '@/lib/llm/generation';
import { assertWithinBudget } from '@/lib/llm/usage';
import { BudgetExceededError } from '@/types';

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 5000;

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
    const body = await request.json();
    const { description } = body;

    if (!description || typeof description !== 'string') {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    const trimmed = description.trim();

    if (trimmed.length < MIN_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: 'Description must be at least ' + MIN_DESCRIPTION_LENGTH + ' characters' },
        { status: 400 }
      );
    }

    if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: 'Description must not exceed ' + MAX_DESCRIPTION_LENGTH + ' characters' },
        { status: 400 }
      );
    }

    await assertWithinBudget(session.user.id);
    const scenario = await generateScenario(trimmed, { userId: session.user.id, purpose: 'generation' });
    return NextResponse.json({ scenario }, { status: 200 });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return NextResponse.json({ error: error.message, code: 'budget_exceeded' }, { status: 429 });
    }
    console.error('Scenario generation failed:', error);
    return NextResponse.json(
      { error: 'Generation failed. Please try again.' },
      { status: 502 }
    );
  }
}
