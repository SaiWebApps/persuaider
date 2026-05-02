import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const scenario = await prisma.scenario.findUnique({
    where: { id },
    include: {
      personas: { orderBy: { displayOrder: 'asc' } },
      members: { include: { user: { select: { id: true, email: true, username: true } } } },
      _count: { select: { conversations: true } },
    },
  });

  if (!scenario) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  }

  return NextResponse.json({ scenario });
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
  if (body.title) updateData.title = body.title;
  if (body.description) updateData.description = body.description;
  if (body.userRole) updateData.userRole = body.userRole;
  if (body.aiRole) updateData.aiRole = body.aiRole;
  if (body.status) updateData.status = body.status;

  const scenario = await prisma.scenario.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ scenario });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const scenario = await prisma.scenario.findUnique({ where: { id } });
  if (!scenario) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  }

  await prisma.scenario.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
