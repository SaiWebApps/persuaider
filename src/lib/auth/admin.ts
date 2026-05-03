import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

export async function requireVerifiedUser(): Promise<NextResponse | null> {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true },
  });

  if (!user || !user.emailVerified) {
    return NextResponse.json({ error: 'Email not verified' }, { status: 403 });
  }

  return null;
}

export function isAdmin(session: { user: { role?: string } } | null): boolean {
  return session?.user?.role === 'admin';
}
