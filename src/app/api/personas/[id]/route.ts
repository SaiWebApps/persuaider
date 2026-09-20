import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/types';
import { parseCharacteristicsInput, serialize } from '@/lib/codec/scenario';

// GET /api/personas/[id] - Get single persona
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const persona = await prisma.persona.findUnique({
      where: { id },
      include: {
        scenario: {
          select: {
            id: true,
            title: true,
          },
        },
        conversations: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!persona) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ persona });
  } catch (error) {
    console.error('Error fetching persona:', error);
    return NextResponse.json(
      { error: 'Failed to fetch persona' },
      { status: 500 }
    );
  }
}

// PATCH /api/personas/[id] - Update persona characteristics, avatar, role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.user.emailVerified) {
      return NextResponse.json({ error: 'Email not verified' }, { status: 403 });
    }

    // Find the persona and its scenario
    const persona = await prisma.persona.findUnique({
      where: { id },
      include: { scenario: { select: { id: true, createdById: true } } },
    });

    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    // Must be admin or scenario owner
    const isAdmin = session.user.role === 'admin';
    const isOwner = persona.scenario.createdById === session.user.id;
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Validate characteristics
    if (body.characteristics !== undefined) {
      if (body.characteristics === null) {
        updates.characteristics = null;
      } else {
        try {
          updates.characteristics = serialize(parseCharacteristicsInput(body.characteristics));
        } catch (error) {
          if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
          throw error;
        }
      }
    }

    // Validate avatarUrl
    if (body.avatarUrl !== undefined) {
      if (body.avatarUrl !== null) {
        if (typeof body.avatarUrl !== 'string') {
          return NextResponse.json({ error: 'avatarUrl must be a string or null' }, { status: 400 });
        }
        if (!body.avatarUrl.startsWith('/uploads/')) {
          return NextResponse.json({ error: 'avatarUrl must start with /uploads/' }, { status: 400 });
        }
        updates.avatarUrl = body.avatarUrl;
      } else {
        updates.avatarUrl = null;
      }
    }

    // Validate roleId
    if (body.roleId !== undefined) {
      if (body.roleId !== null) {
        if (typeof body.roleId !== 'string') {
          return NextResponse.json({ error: 'roleId must be a string or null' }, { status: 400 });
        }
        const role = await prisma.role.findUnique({ where: { id: body.roleId } });
        if (!role) {
          return NextResponse.json({ error: 'Role not found' }, { status: 400 });
        }
        if (role.scenarioId !== persona.scenario.id) {
          return NextResponse.json({ error: 'Role must belong to the same scenario' }, { status: 400 });
        }
        updates.roleId = body.roleId;
      } else {
        updates.roleId = null;
      }
    }

    // Validate initialGreeting
    if (body.initialGreeting !== undefined) {
      if (body.initialGreeting !== null && typeof body.initialGreeting !== 'string') {
        return NextResponse.json({ error: 'initialGreeting must be a string or null' }, { status: 400 });
      }
      updates.initialGreeting = body.initialGreeting;
    }

    const updated = await prisma.persona.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({ persona: updated });
  } catch (error) {
    console.error('Error updating persona:', error);
    return NextResponse.json({ error: 'Failed to update persona' }, { status: 500 });
  }
}
