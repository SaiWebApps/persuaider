import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

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

export function isAdmin(session: { user: { role?: string } } | null): boolean {
  return session?.user?.role === 'admin';
}
