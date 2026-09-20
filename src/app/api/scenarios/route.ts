import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import * as crypto from 'crypto';
import { ValidationError } from '@/types';
import {
  DEFAULT_EVALUATION_CRITERIA,
  DEFAULT_WIN_CONDITION,
  parseCharacteristicsInput,
  parseEvaluationCriteriaInput,
  parseIssuesInput,
  parseTagsInput,
  parseWinConditionInput,
  serialize,
} from '@/lib/codec/scenario';

export async function POST(request: Request) {
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

  try {
    const body = await request.json();
    const { title, description, userRole, aiRole, personas, accessCode, evaluationCriteria, winCondition, tags, issues } = body;

    if (!title || !description || !userRole || !aiRole) {
      return NextResponse.json(
        { error: 'Title, description, userRole, and aiRole are required' },
        { status: 400 }
      );
    }

    // Learner-created scenarios are scored like any other: explicit criteria
    // if the caller sent them, otherwise the platform default frameworks.
    let criteriaStr = serialize(DEFAULT_EVALUATION_CRITERIA);
    let winStr = serialize(DEFAULT_WIN_CONDITION);
    let tagsStr = '[]';
    let issuesStr = '[]';
    const personaRows: Array<{ name: string; description: string; roleType: string; initialGreeting: string | null; characteristics: string | null }> = [];
    try {
      if (evaluationCriteria !== undefined) criteriaStr = serialize(parseEvaluationCriteriaInput(evaluationCriteria));
      if (winCondition !== undefined) winStr = serialize(parseWinConditionInput(winCondition));
      if (tags !== undefined) tagsStr = serialize(parseTagsInput(tags));
      if (issues !== undefined) issuesStr = serialize(parseIssuesInput(issues));
      if (Array.isArray(personas)) {
        for (const p of personas) {
          if (!p?.name) continue;
          personaRows.push({
            name: p.name,
            description: p.description || '',
            roleType: p.roleType || 'Counterpart',
            initialGreeting: p.initialGreeting || null,
            characteristics: p.characteristics ? serialize(parseCharacteristicsInput(p.characteristics)) : null,
          });
        }
      }
    } catch (error) {
      if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }

    const joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    const scenario = await prisma.scenario.create({
      data: {
        title,
        description,
        userRole,
        aiRole,
        evaluationCriteria: criteriaStr,
        winCondition: winStr,
        tags: tagsStr,
        issues: issuesStr,
        visibility: 'public',
        joinCode,
        accessCode: accessCode?.trim() || null,
        status: 'published',
        createdById: session.user.id,
      },
    });

    for (let i = 0; i < personaRows.length; i++) {
      await prisma.persona.create({ data: { scenarioId: scenario.id, ...personaRows[i], displayOrder: i + 1 } });
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
