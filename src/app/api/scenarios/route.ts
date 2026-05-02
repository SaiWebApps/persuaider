import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import * as crypto from 'crypto';

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, description, userRole, aiRole, personas, accessCode } = body;

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
        evaluationCriteria: '{}',
        winCondition: JSON.stringify({ type: 'manual', maxMessages: 30 }),
        visibility: 'public',
        joinCode,
        accessCode: accessCode?.trim() || null,
        status: 'published',
        createdById: session.user.id,
      },
    });

    if (Array.isArray(personas) && personas.length > 0) {
      for (let i = 0; i < personas.length; i++) {
        const p = personas[i];
        if (!p.name) continue;
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

    await prisma.userScenario.create({
      data: { userId: session.user.id, scenarioId: scenario.id },
    });

    return NextResponse.json({ scenario: { ...scenario, joinCode } }, { status: 201 });
  } catch (error) {
    console.error('Error creating scenario:', error);
    return NextResponse.json({ error: 'Failed to create scenario' }, { status: 500 });
  }
}
