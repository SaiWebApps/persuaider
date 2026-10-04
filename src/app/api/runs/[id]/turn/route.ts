import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { takeRunTurn } from '@/lib/run/run';
import { BudgetExceededError, NotFoundError } from '@/types';

// POST /api/runs/[id]/turn - add the next turn of an AI vs AI run
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const seenTurns = (body as { seenTurns?: unknown }).seenTurns;
  if (typeof seenTurns !== 'number' || !Number.isInteger(seenTurns) || seenTurns < 0) {
    return NextResponse.json({ error: 'seenTurns must be a whole number' }, { status: 400 });
  }

  try {
    const state = await takeRunTurn(id, session.user.id, seenTurns);
    return NextResponse.json(state);
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    if (error instanceof BudgetExceededError) {
      return NextResponse.json({ error: error.message, code: 'budget_exceeded' }, { status: 429 });
    }
    console.error('Error taking run turn:', error);
    return NextResponse.json({ error: 'The next turn could not be generated right now.' }, { status: 502 });
  }
}
