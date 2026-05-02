import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id: scenarioId } = await params;
  const body = await request.json();
  const { userId } = body;

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const existing = await prisma.userScenario.findUnique({
    where: { userId_scenarioId: { userId, scenarioId } },
  });

  if (existing) {
    return NextResponse.json({ error: 'User already assigned to this scenario' }, { status: 409 });
  }

  const assignment = await prisma.userScenario.create({
    data: { userId, scenarioId },
  });

  return NextResponse.json({ assignment }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id: scenarioId } = await params;
  const body = await request.json();
  const { userId } = body;

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  await prisma.userScenario.deleteMany({
    where: { userId, scenarioId },
  });

  return NextResponse.json({ success: true });
}
