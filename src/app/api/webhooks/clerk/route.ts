import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/db/client';

interface ClerkEmailAddress {
  email_address: string;
  id: string;
}

interface ClerkUserEvent {
  id: string;
  primary_email_address_id?: string | null;
  email_addresses: ClerkEmailAddress[];
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  public_metadata: Record<string, unknown>;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing Svix headers' }, { status: 401 });
  }

  const body = await request.text();

  const wh = new Webhook(webhookSecret);
  let event: { type: string; data: ClerkUserEvent };

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const { type, data } = event;

  if (!data.id) {
    return NextResponse.json({ error: 'Missing user ID in event' }, { status: 400 });
  }

  if (type === 'user.created' || type === 'user.updated') {
    const addresses = (data.email_addresses ?? []) as Array<{ id?: string; email_address?: string; verification?: { status?: string } | null }>;
    const primary = addresses.find((a) => a.id && a.id === data.primary_email_address_id) ?? addresses[0];
    const email = primary?.email_address;
    if (!email) {
      return NextResponse.json({ error: 'No email in event' }, { status: 400 });
    }
    // Never link or create a database row from an unverified address: that
    // would let anyone claim a pre-seeded (possibly admin) account by email.
    if (primary?.verification?.status !== 'verified') {
      return NextResponse.json({ received: true, skipped: 'email not verified' }, { status: 200 });
    }

    const username =
      data.username ||
      [data.first_name, data.last_name].filter(Boolean).join(' ') ||
      email.split('@')[0];

    const role = (data.public_metadata?.role as string) || 'user';

    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    const existingByClerkId = await prisma.user.findUnique({ where: { clerkId: data.id } });

    // The database role column is the single source of truth for authorization.
    // Updates never touch it; Clerk metadata only seeds the role on first creation.
    if (existingByClerkId) {
      await prisma.user.update({
        where: { clerkId: data.id },
        data: { email, emailVerified: new Date() },
      });
    } else if (existingByEmail) {
      await prisma.user.update({
        where: { email },
        data: { clerkId: data.id, emailVerified: new Date() },
      });
    } else {
      let uniqueUsername = username;
      const taken = await prisma.user.findUnique({ where: { username } });
      if (taken) {
        uniqueUsername = `${username}-${Date.now().toString(36)}`;
      }

      await prisma.user.create({
        data: {
          clerkId: data.id,
          email,
          username: uniqueUsername,
          role,
          emailVerified: new Date(),
        },
      });
    }
  }

  if (type === 'user.deleted') {
    const existingUser = await prisma.user.findUnique({ where: { clerkId: data.id } });
    if (existingUser) {
      await prisma.user.update({
        where: { clerkId: data.id },
        data: { clerkId: null },
      });
    }
  }

  return NextResponse.json({ received: true });
}
