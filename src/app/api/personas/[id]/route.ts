import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

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
      if (body.characteristics !== null) {
        if (typeof body.characteristics !== 'object' || Array.isArray(body.characteristics)) {
          return NextResponse.json({ error: 'characteristics must be an object' }, { status: 400 });
        }

        const chars = body.characteristics;

        // Validate openness
        if (chars.openness !== undefined) {
          if (typeof chars.openness !== 'number' || isNaN(chars.openness)) {
            return NextResponse.json({ error: 'openness must be a number between 0 and 1' }, { status: 400 });
          }
          if (chars.openness < 0 || chars.openness > 1) {
            return NextResponse.json({ error: 'openness must be between 0 and 1' }, { status: 400 });
          }
        }

        // Validate concerns
        if (chars.concerns !== undefined) {
          if (!Array.isArray(chars.concerns)) {
            return NextResponse.json({ error: 'concerns must be an array' }, { status: 400 });
          }
          if (chars.concerns.length > 20) {
            return NextResponse.json({ error: 'concerns cannot exceed 20 items' }, { status: 400 });
          }
          if (!chars.concerns.every((c: unknown) => typeof c === 'string')) {
            return NextResponse.json({ error: 'concerns must be an array of strings' }, { status: 400 });
          }
        }

        // Validate personality
        if (chars.personality !== undefined) {
          if (!Array.isArray(chars.personality)) {
            return NextResponse.json({ error: 'personality must be an array' }, { status: 400 });
          }
          if (chars.personality.length > 10) {
            return NextResponse.json({ error: 'personality cannot exceed 10 items' }, { status: 400 });
          }
          if (!chars.personality.every((p: unknown) => typeof p === 'string')) {
            return NextResponse.json({ error: 'personality must be an array of strings' }, { status: 400 });
          }
        }

        // Validate roleBehavior
        if (chars.roleBehavior !== undefined) {
          if (typeof chars.roleBehavior !== 'string') {
            return NextResponse.json({ error: 'roleBehavior must be a string' }, { status: 400 });
          }
          if (chars.roleBehavior.length > 1000) {
            return NextResponse.json({ error: 'roleBehavior cannot exceed 1000 characters' }, { status: 400 });
          }
        }

        updates.characteristics = JSON.stringify(chars);
      } else {
        updates.characteristics = null;
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
