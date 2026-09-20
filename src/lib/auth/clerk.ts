import { auth, currentUser } from '@clerk/nextjs/server';
import type { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export { currentUser };

export { auth as clerkAuth };

export interface AuthSession {
  user: {
    id: string;
    role: string;
    emailVerified: boolean;
  };
}

/**
 * Resolve the signed-in Clerk user to the app's database user.
 *
 * The database `role` column is the single source of truth for authorization.
 * If Clerk knows the user but the database does not (the webhook has not run,
 * or this is a local environment with no webhook), the row is created here on
 * first sight, or linked by email to a pre-seeded row. This makes the webhook
 * an optimization rather than a login prerequisite.
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  // Deliberately not wrapped in try/catch: Next.js signals "this route must be
  // dynamic" by throwing from headers()/auth(), and swallowing that breaks the
  // build. A genuinely misconfigured Clerk key surfaces as a loud 500, which is
  // far easier to diagnose than a silent "logged out".
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  try {
    let user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
      select: { id: true, role: true },
    });

    if (!user) {
      user = await provisionUser(clerkUserId);
      if (!user) return null;
    }

    return {
      user: {
        id: user.id,
        role: user.role,
        emailVerified: true,
      },
    };
  } catch (error) {
    console.error('[auth] failed to resolve database user for Clerk id', clerkUserId, error);
    return null;
  }
}

async function provisionUser(clerkUserId: string): Promise<{ id: string; role: string } | null> {
  const clerkUser = await currentUser();
  const primary = clerkUser?.primaryEmailAddress ?? clerkUser?.emailAddresses?.[0];
  const email = primary?.emailAddress;
  if (!email) {
    console.error('[auth] Clerk user has no email address; cannot provision', clerkUserId);
    return null;
  }
  // Linking by email is only safe when Clerk has verified that address;
  // otherwise anyone could claim a pre-seeded (possibly admin) row.
  if (primary?.verification?.status !== 'verified') {
    console.error('[auth] refusing to provision: primary email not verified', email);
    return null;
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, clerkId: true } });
  if (existing) {
    if (existing.clerkId && existing.clerkId !== clerkUserId) {
      console.error('[auth] email already linked to a different Clerk user', email);
      return null;
    }
    const linked = await prisma.user.update({
      where: { id: existing.id },
      data: { clerkId: clerkUserId, emailVerified: new Date() },
      select: { id: true, role: true },
    });
    console.info('[auth] linked existing user to Clerk', email);
    return linked;
  }

  const baseName =
    clerkUser?.username ||
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') ||
    email.split('@')[0];

  try {
    const created = await prisma.user.create({
      data: {
        clerkId: clerkUserId,
        email,
        username: await uniqueUsername(baseName),
        role: 'user',
        emailVerified: new Date(),
      },
      select: { id: true, role: true },
    });
    console.info('[auth] provisioned new user from Clerk', email);
    return created;
  } catch (error) {
    // Two first requests raced; the other one won. Re-read instead of failing.
    if ((error as { code?: string })?.code === 'P2002') {
      const byClerk = await prisma.user.findUnique({ where: { clerkId: clerkUserId }, select: { id: true, role: true } });
      if (byClerk) return byClerk;
      // The collision may have been on username; the row for this email exists now or the
      // other request will link it. One more attempt through the linking path.
      const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, clerkId: true } });
      if (byEmail && (!byEmail.clerkId || byEmail.clerkId === clerkUserId)) {
        return prisma.user.update({ where: { id: byEmail.id }, data: { clerkId: clerkUserId }, select: { id: true, role: true } });
      }
      return null;
    }
    throw error;
  }
}

async function uniqueUsername(base: string): Promise<string> {
  const clean = base.trim().slice(0, 40) || 'user';
  const taken = await prisma.user.findUnique({ where: { username: clean }, select: { id: true } });
  if (!taken) return clean;
  return `${clean}-${Math.random().toString(36).slice(2, 8)}`;
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
