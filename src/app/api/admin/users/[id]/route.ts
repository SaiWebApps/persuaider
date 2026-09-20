import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true,
      _count: { select: { conversations: true, scenarioMemberships: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();

  const updateData: Record<string, unknown> = {};

  if (body.role && ['user', 'admin'].includes(body.role)) {
    updateData.role = body.role;
  }

  if (body.dailyBudgetUsd !== undefined) {
    if (body.dailyBudgetUsd === null) {
      updateData.dailyBudgetUsd = null;
    } else if (typeof body.dailyBudgetUsd === 'number' && Number.isFinite(body.dailyBudgetUsd) && body.dailyBudgetUsd >= 0 && body.dailyBudgetUsd <= 1000) {
      updateData.dailyBudgetUsd = body.dailyBudgetUsd;
    } else {
      return NextResponse.json({ error: 'dailyBudgetUsd must be a number between 0 and 1000, or null for the default' }, { status: 400 });
    }
  }

  if (body.resetPassword) {
    return NextResponse.json(
      { error: 'Password reset is managed through Clerk. Use the Clerk dashboard.' },
      { status: 400 }
    );
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, email: true, username: true, role: true, dailyBudgetUsd: true },
  });

  return NextResponse.json({ user });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  // Prevent admin from deleting themselves
  const session = await auth();
  if (session && session.user.id === id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
