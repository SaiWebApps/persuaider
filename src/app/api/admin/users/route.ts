import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json();
  const { email, username } = body;

  if (!email || !username) {
    return NextResponse.json(
      { error: 'Email and username are required' },
      { status: 400 }
    );
  }

  if (email.length > 254) {
    return NextResponse.json(
      { error: 'Email must be 254 characters or fewer' },
      { status: 400 }
    );
  }

  if (username.length > 50) {
    return NextResponse.json(
      { error: 'Username must be 50 characters or fewer' },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (existing) {
    return NextResponse.json(
      { error: existing.email === email ? 'Email already exists' : 'Username already exists' },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      username,
      role: 'user',
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user });
}
