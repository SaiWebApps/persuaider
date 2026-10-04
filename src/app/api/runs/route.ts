import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { createRun } from '@/lib/run/run';
import { AuthorizationError, NotFoundError } from '@/types';

// POST /api/runs - start an AI vs AI run against the chosen counterpart
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { emailVerified: true } });
  if (!user?.emailVerified) return NextResponse.json({ error: 'Email not verified' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const personaId = (body as { personaId?: unknown }).personaId;
  if (typeof personaId !== 'string' || !personaId) {
    return NextResponse.json({ error: 'personaId is required' }, { status: 400 });
  }

  try {
    const run = await createRun(session.user.id, session.user.role, personaId);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Error starting run:', error);
    return NextResponse.json({ error: 'Failed to start the run' }, { status: 500 });
  }
}
