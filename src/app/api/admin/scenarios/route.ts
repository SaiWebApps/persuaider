import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import * as crypto from 'crypto';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const scenarios = await prisma.scenario.findMany({
    include: {
      _count: { select: { personas: true, members: true, conversations: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ scenarios });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const session = await auth();
  const body = await request.json();
  const { title, description, userRole, aiRole, evaluationCriteria, personas } = body;

  if (!title || !description || !userRole || !aiRole) {
    return NextResponse.json(
      { error: 'Title, description, userRole, and aiRole are required' },
      { status: 400 }
    );
  }

  const joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();

  const scenario = await prisma.scenario.create({
    data: {
      title,
      description,
      userRole,
      aiRole,
      evaluationCriteria: evaluationCriteria ? JSON.stringify(evaluationCriteria) : '{}',
      winCondition: JSON.stringify({ type: 'manual', maxMessages: 30 }),
      visibility: 'unlisted',
      joinCode,
      status: 'published',
      createdById: session!.user.id,
    },
  });

  if (Array.isArray(personas) && personas.length > 0) {
    for (let i = 0; i < personas.length; i++) {
      const p = personas[i];
      await prisma.persona.create({
        data: {
          scenarioId: scenario.id,
          name: p.name,
          description: p.description || '',
          roleType: p.roleType || 'Counterpart',
          initialGreeting: p.initialGreeting || null,
          characteristics: p.characteristics ? JSON.stringify(p.characteristics) : null,
          displayOrder: i + 1,
        },
      });
    }
  }

  const created = await prisma.scenario.findUnique({
    where: { id: scenario.id },
    include: {
      personas: true,
      _count: { select: { members: true } },
    },
  });

  return NextResponse.json({ scenario: created }, { status: 201 });
}
