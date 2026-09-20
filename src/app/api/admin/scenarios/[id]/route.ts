import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/types';
import {
  parseContextNotesInput,
  parseEvaluationCriteriaInput,
  parseTagsInput,
  parseVisibilityInput,
  parseWinConditionInput,
  readEvaluationCriteria,
  readTags,
  readWinCondition,
  serialize,
} from '@/lib/codec/scenario';

// Valid status transitions: draft->published, published->archived only
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['published'],
  published: ['archived'],
  archived: [],
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const scenario = await prisma.scenario.findUnique({
    where: { id },
    include: {
      personas: { orderBy: { displayOrder: 'asc' } },
      members: { include: { user: { select: { id: true, email: true, username: true } } } },
      sourceFiles: { orderBy: { displayOrder: 'asc' } },
      _count: { select: { conversations: true } },
    },
  });

  if (!scenario) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  }

  const response = {
    ...scenario,
    evaluationCriteria: readEvaluationCriteria(scenario.evaluationCriteria),
    winCondition: readWinCondition(scenario.winCondition),
    tags: readTags(scenario.tags),
  };

  return NextResponse.json({ scenario: response });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.scenario.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};

  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.userRole !== undefined) updateData.userRole = body.userRole;
  if (body.aiRole !== undefined) updateData.aiRole = body.aiRole;

  try {
    if (body.evaluationCriteria !== undefined) {
      updateData.evaluationCriteria = serialize(parseEvaluationCriteriaInput(body.evaluationCriteria));
    }
    if (body.winCondition !== undefined) updateData.winCondition = serialize(parseWinConditionInput(body.winCondition));
    if (body.contextNotes !== undefined) updateData.contextNotes = parseContextNotesInput(body.contextNotes);
    if (body.tags !== undefined) updateData.tags = serialize(parseTagsInput(body.tags));
    if (body.visibility !== undefined) updateData.visibility = parseVisibilityInput(body.visibility);
  } catch (error) {
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  if (body.status !== undefined) {
    const currentStatus = existing.status;
    const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status transition: ${currentStatus} → ${body.status}` },
        { status: 400 }
      );
    }
    updateData.status = body.status;
  }

  const scenario = await prisma.scenario.update({
    where: { id },
    data: updateData,
  });

  const response = {
    ...scenario,
    evaluationCriteria: readEvaluationCriteria(scenario.evaluationCriteria),
    winCondition: readWinCondition(scenario.winCondition),
    tags: readTags(scenario.tags),
  };

  return NextResponse.json({ scenario: response });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const scenario = await prisma.scenario.findUnique({ where: { id } });
  if (!scenario) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  }

  await prisma.scenario.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
