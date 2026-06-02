import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import * as crypto from 'crypto';
import type { EvaluationCriteria, WinCondition } from '@/types';

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
  const {
    title,
    description,
    userRole,
    aiRole,
    evaluationCriteria,
    winCondition,
    contextNotes,
    tags,
    visibility,
    personas,
  } = body;

  if (!title || !description || !userRole || !aiRole) {
    return NextResponse.json(
      { error: 'Title, description, userRole, and aiRole are required' },
      { status: 400 }
    );
  }

  // Validate optional fields if provided
  let evalCriteriaStr = '{}';
  if (evaluationCriteria !== undefined) {
    if (typeof evaluationCriteria === 'string') {
      return NextResponse.json(
        { error: 'evaluationCriteria must be an object, not a string' },
        { status: 400 }
      );
    }
    const evalError = validateEvaluationCriteria(evaluationCriteria);
    if (evalError) {
      return NextResponse.json({ error: evalError }, { status: 400 });
    }
    evalCriteriaStr = JSON.stringify(evaluationCriteria as EvaluationCriteria);
  }

  let winConditionStr = JSON.stringify({ type: 'manual', maxMessages: 30 });
  if (winCondition !== undefined) {
    const winError = validateWinCondition(winCondition);
    if (winError) {
      return NextResponse.json({ error: winError }, { status: 400 });
    }
    winConditionStr = JSON.stringify(winCondition as WinCondition);
  }

  let contextNotesVal: string | null = null;
  if (contextNotes !== undefined) {
    if (contextNotes !== null && typeof contextNotes !== 'string') {
      return NextResponse.json(
        { error: 'contextNotes must be a string or null' },
        { status: 400 }
      );
    }
    if (contextNotes !== null && contextNotes.length > 5000) {
      return NextResponse.json(
        { error: 'contextNotes must be at most 5000 characters' },
        { status: 400 }
      );
    }
    contextNotesVal = contextNotes;
  }

  let tagsStr = '[]';
  if (tags !== undefined) {
    const tagsError = validateTags(tags);
    if (tagsError) {
      return NextResponse.json({ error: tagsError }, { status: 400 });
    }
    tagsStr = JSON.stringify(tags);
  }

  let visibilityVal = 'unlisted';
  if (visibility !== undefined) {
    if (visibility !== 'public' && visibility !== 'unlisted') {
      return NextResponse.json(
        { error: 'visibility must be "public" or "unlisted"' },
        { status: 400 }
      );
    }
    visibilityVal = visibility;
  }

  const joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();

  const scenario = await prisma.scenario.create({
    data: {
      title,
      description,
      userRole,
      aiRole,
      evaluationCriteria: evalCriteriaStr,
      winCondition: winConditionStr,
      contextNotes: contextNotesVal,
      tags: tagsStr,
      visibility: visibilityVal,
      joinCode,
      status: 'draft',
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
