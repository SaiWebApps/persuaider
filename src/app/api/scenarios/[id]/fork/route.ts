import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';

// POST /api/scenarios/[id]/fork - Fork a public scenario
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check email verification
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true },
  });
  if (!currentUser || !currentUser.emailVerified) {
    return NextResponse.json({ error: 'Email not verified' }, { status: 403 });
  }

  // Find the source scenario with personas
  const source = await prisma.scenario.findUnique({
    where: { id },
    include: {
      personas: true,
      roles: { orderBy: { displayOrder: 'asc' } },
      members: { select: { userId: true } },
    },
  });

  if (!source) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  }

  // Check if archived (specific error)
  if (source.status === 'archived') {
    return NextResponse.json(
      { error: 'Cannot fork archived scenario' },
      { status: 403 }
    );
  }

  // Must be published
  if (source.status !== 'published') {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  }

  // Must be public OR user is a member
  const isMember = source.members.some((m) => m.userId === session.user.id);
  if (source.visibility !== 'public' && !isMember) {
    return NextResponse.json(
      { error: 'Cannot fork this scenario' },
      { status: 403 }
    );
  }

  // Generate new join code
  const joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();

  // Create forked scenario (accessCode is intentionally NOT copied)
  const newScenario = await prisma.scenario.create({
    data: {
      title: `Fork of ${source.title}`,
      description: source.description,
      userRole: source.userRole,
      aiRole: source.aiRole,
      evaluationCriteria: source.evaluationCriteria,
      winCondition: source.winCondition,
      tags: source.tags,
      contextNotes: source.contextNotes,
      issues: source.issues,
      forkedFromId: source.id,
      // A copy is the forker's own scenario: unlisted until they choose to publish it.
      visibility: 'unlisted',
      status: 'published',
      createdById: session.user.id,
      joinCode,
    },
  });

  // Copy roles (sides with confidential briefs), remembering old → new ids
  const roleMap = new Map<string, string>();
  for (const role of source.roles ?? []) {
    const copy = await prisma.role.create({
      data: { scenarioId: newScenario.id, name: role.name, description: role.description, displayOrder: role.displayOrder },
    });
    roleMap.set(role.id, copy.id);
  }
  if (source.learnerRoleId && roleMap.has(source.learnerRoleId)) {
    await prisma.scenario.update({ where: { id: newScenario.id }, data: { learnerRoleId: roleMap.get(source.learnerRoleId) } });
  }

  // Copy all personas, keeping the side each one plays
  if (source.personas.length > 0) {
    await Promise.all(
      source.personas.map((persona) =>
        prisma.persona.create({
          data: {
            name: persona.name,
            description: persona.description,
            roleType: persona.roleType,
            characteristics: persona.characteristics,
            initialGreeting: persona.initialGreeting,
            displayOrder: persona.displayOrder,
            roleId: persona.roleId ? (roleMap.get(persona.roleId) ?? null) : null,
            scenarioId: newScenario.id,
          },
        })
      )
    );
  }

  // Atomically increment source inspirationCount
  await prisma.scenario.update({
    where: { id: source.id },
    data: { inspirationCount: { increment: 1 } },
  });

  // Auto-join the user to the new scenario
  await prisma.userScenario.create({
    data: {
      userId: session.user.id,
      scenarioId: newScenario.id,
    },
  });

  return NextResponse.json(
    {
      scenario: {
        id: newScenario.id,
        title: newScenario.title,
        joinCode: newScenario.joinCode,
      },
    },
    { status: 201 }
  );
}
