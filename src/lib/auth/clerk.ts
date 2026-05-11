import { auth, currentUser } from '@clerk/nextjs/server';
import type { NextResponse } from 'next/server';

export { currentUser };

export { auth as clerkAuth };

export interface AuthSession {
  user: {
    id: string;
    role: string;
    emailVerified: boolean;
  };
}

export async function getAuthSession(): Promise<AuthSession | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  return {
    user: {
      id: userId,
      role: (sessionClaims?.metadata as { role?: string })?.role || 'user',
      emailVerified: true,
    },
  };
}

export async function signOut(): Promise<void> {
  const { redirect } = await import('next/navigation');
  redirect('/login');
}

export async function requireAdmin(): Promise<NextResponse | null> {
  const { NextResponse: NR } = await import('next/server');
  const session = await getAuthSession();
  if (!session) return NR.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'admin') return NR.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function requireVerifiedUser(): Promise<NextResponse | null> {
  const { NextResponse: NR } = await import('next/server');
  const session = await getAuthSession();
  if (!session) return NR.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

export function isAdmin(session: AuthSession | null): boolean {
  return session?.user?.role === 'admin';
}
