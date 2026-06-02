import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/client';
import type { EvaluationCriteria, WinCondition } from '@/types';

// Valid status transitions: draft->published, published->archived only
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['published'],
  published: ['archived'],
  archived: [],
};

function validateEvaluationCriteria(val: unknown): string | null {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    return 'evaluationCriteria must be an object';
  }
  const obj = val as Record<string, unknown>;

  if (!Array.isArray(obj.frameworks)) {
    return 'evaluationCriteria.frameworks must be an array';
  }

  for (let i = 0; i < obj.frameworks.length; i++) {
    const fw = obj.frameworks[i] as Record<string, unknown>;
    if (!fw || typeof fw !== 'object') {
      return `evaluationCriteria.frameworks[${i}] must be an object`;
    }
    if (typeof fw.name !== 'string' || fw.name.length === 0 || fw.name.length > 100) {
      return `evaluationCriteria.frameworks[${i}].name must be a string (1-100 chars)`;
    }
    if (typeof fw.description !== 'string') {
      return `evaluationCriteria.frameworks[${i}].description must be a string`;
    }
    if (!Array.isArray(fw.elements)) {
      return `evaluationCriteria.frameworks[${i}].elements must be an array`;
    }
    for (let j = 0; j < fw.elements.length; j++) {
      const el = fw.elements[j] as Record<string, unknown>;
      if (!el || typeof el !== 'object') {
        return `evaluationCriteria.frameworks[${i}].elements[${j}] must be an object`;
      }
      if (typeof el.name !== 'string') {
        return `evaluationCriteria.frameworks[${i}].elements[${j}].name must be a string`;
      }
      if (typeof el.description !== 'string') {
        return `evaluationCriteria.frameworks[${i}].elements[${j}].description must be a string`;
      }
    }
    if (typeof fw.weight !== 'number' || fw.weight < 0 || fw.weight > 100) {
      return `evaluationCriteria.frameworks[${i}].weight must be a number between 0 and 100`;
    }
  }

  if (obj.scoringInstructions !== undefined) {
    if (typeof obj.scoringInstructions !== 'string') {
      return 'evaluationCriteria.scoringInstructions must be a string';
    }
    if (obj.scoringInstructions.length > 2000) {
      return 'evaluationCriteria.scoringInstructions must be at most 2000 characters';
    }
  }

  return null;
}

function validateWinCondition(val: unknown): string | null {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    return 'winCondition must be an object';
  }
  const obj = val as Record<string, unknown>;

  if (obj.type !== 'score_threshold' && obj.type !== 'manual') {
    return 'winCondition.type must be "score_threshold" or "manual"';
  }

  if (obj.type === 'score_threshold') {
    if (typeof obj.threshold !== 'number' || obj.threshold < 1 || obj.threshold > 100) {
      return 'winCondition.threshold must be a number between 1 and 100 when type is score_threshold';
    }
  }

  if (obj.maxMessages !== undefined && obj.maxMessages !== null) {
    if (typeof obj.maxMessages !== 'number' || obj.maxMessages < 1 || obj.maxMessages > 100) {
      return 'winCondition.maxMessages must be a number between 1 and 100';
    }
  }

  return null;
}

function validateTags(val: unknown): string | null {
  if (!Array.isArray(val)) {
    return 'tags must be an array';
  }
  if (val.length > 10) {
    return 'tags must have at most 10 items';
  }
  const seen = new Set<string>();
  for (let i = 0; i < val.length; i++) {
    if (typeof val[i] !== 'string') {
      return `tags[${i}] must be a string`;
    }
    if ((val[i] as string).length > 50) {
      return `tags[${i}] must be at most 50 characters`;
    }
    const lower = (val[i] as string).toLowerCase();
    if (seen.has(lower)) {
      return `tags contains duplicate: "${val[i]}"`;
    }
    seen.add(lower);
  }
  return null;
}

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
    evaluationCriteria: scenario.evaluationCriteria ? JSON.parse(scenario.evaluationCriteria) : {},
    winCondition: scenario.winCondition ? JSON.parse(scenario.winCondition) : { type: 'manual' },
    tags: scenario.tags ? JSON.parse(scenario.tags) : [],
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

  if (body.evaluationCriteria !== undefined) {
    if (typeof body.evaluationCriteria === 'string') {
      return NextResponse.json(
        { error: 'evaluationCriteria must be an object, not a string' },
        { status: 400 }
      );
    }
    const evalError = validateEvaluationCriteria(body.evaluationCriteria);
    if (evalError) {
      return NextResponse.json({ error: evalError }, { status: 400 });
    }
    updateData.evaluationCriteria = JSON.stringify(body.evaluationCriteria as EvaluationCriteria);
  }

  if (body.winCondition !== undefined) {
    const winError = validateWinCondition(body.winCondition);
    if (winError) {
      return NextResponse.json({ error: winError }, { status: 400 });
    }
    updateData.winCondition = JSON.stringify(body.winCondition as WinCondition);
  }

  if (body.contextNotes !== undefined) {
    if (body.contextNotes !== null && typeof body.contextNotes !== 'string') {
      return NextResponse.json(
        { error: 'contextNotes must be a string or null' },
        { status: 400 }
      );
    }
    if (body.contextNotes !== null && body.contextNotes.length > 5000) {
      return NextResponse.json(
        { error: 'contextNotes must be at most 5000 characters' },
        { status: 400 }
      );
    }
    updateData.contextNotes = body.contextNotes;
  }

  if (body.tags !== undefined) {
    const tagsError = validateTags(body.tags);
    if (tagsError) {
      return NextResponse.json({ error: tagsError }, { status: 400 });
    }
    updateData.tags = JSON.stringify(body.tags);
  }

  if (body.visibility !== undefined) {
    if (body.visibility !== 'public' && body.visibility !== 'unlisted') {
      return NextResponse.json(
        { error: 'visibility must be "public" or "unlisted"' },
        { status: 400 }
      );
    }
    updateData.visibility = body.visibility;
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
    evaluationCriteria: scenario.evaluationCriteria ? JSON.parse(scenario.evaluationCriteria) : {},
    winCondition: scenario.winCondition ? JSON.parse(scenario.winCondition) : { type: 'manual' },
    tags: scenario.tags ? JSON.parse(scenario.tags) : [],
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
