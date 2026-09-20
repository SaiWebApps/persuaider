import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/types';
import { parseIssuesInput, parseVisibilityInput, readIssues, serialize } from '@/lib/codec/scenario';

/**
 * A creator (or an admin) can read and edit their own scenario: title, description,
 * visibility, sides (name and confidential brief), which side the learner plays,
 * and the hidden Issue numbers. The same validation as creation applies.
 */

async function loadEditable(id: string, userId: string, role: string) {
  const scenario = await prisma.scenario.findUnique({
    where: { id },
    include: { roles: { orderBy: { displayOrder: 'asc' } }, personas: { select: { id: true, name: true, roleId: true } } },
  });
  if (!scenario) return { status: 404 as const };
  if (scenario.createdById !== userId && role !== 'admin') return { status: 404 as const }; // no existence leak
  return { status: 200 as const, scenario };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const loaded = await loadEditable(id, session.user.id, session.user.role);
  if (loaded.status !== 200) return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  const s = loaded.scenario;
  return NextResponse.json({
    scenario: {
      id: s.id,
      title: s.title,
      description: s.description,
      userRole: s.userRole,
      aiRole: s.aiRole,
      visibility: s.visibility,
      joinCode: s.joinCode,
      learnerRoleId: s.learnerRoleId,
      roles: s.roles.map((r) => ({ id: r.id, name: r.name, description: r.description })),
      personas: s.personas,
      issues: readIssues(s.issues),
    },
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const loaded = await loadEditable(id, session.user.id, session.user.role);
  if (loaded.status !== 200) return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  const current = loaded.scenario;

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  const roleUpdates: Array<{ id: string; name: string; description: string }> = [];

  try {
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) throw new ValidationError('title must be 1–200 characters', 'title');
      data.title = body.title.trim();
    }
    if (body.description !== undefined) {
      if (typeof body.description !== 'string' || !body.description.trim() || body.description.length > 5000) throw new ValidationError('description must be 1–5000 characters', 'description');
      data.description = body.description.trim();
    }
    if (body.visibility !== undefined) data.visibility = parseVisibilityInput(body.visibility);
    if (body.issues !== undefined) {
      const issues = parseIssuesInput(body.issues);
      if (issues.length > 0 && current.roles.length !== 2) throw new ValidationError('issues need exactly two sides (roles)', 'roles');
      data.issues = serialize(issues);
    }
    if (body.roles !== undefined) {
      if (!Array.isArray(body.roles)) throw new ValidationError('roles must be an array', 'roles');
      for (const r of body.roles) {
        const existing = current.roles.find((x) => x.id === r?.id);
        if (!existing) throw new ValidationError('roles: unknown role id', 'roles');
        if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 100) throw new ValidationError('roles: name must be 1–100 characters', 'roles');
        if (typeof r.description !== 'string' || r.description.length > 5000) throw new ValidationError('roles: description must be at most 5000 characters', 'roles');
        roleUpdates.push({ id: existing.id, name: r.name.trim(), description: r.description });
      }
      const names = current.roles.map((x) => roleUpdates.find((u) => u.id === x.id)?.name ?? x.name).map((n) => n.toLowerCase());
      if (new Set(names).size !== names.length) throw new ValidationError('roles must have distinct names', 'roles');
    }
    if (body.learnerRoleId !== undefined) {
      if (body.learnerRoleId !== null) {
        if (!current.roles.some((r) => r.id === body.learnerRoleId)) throw new ValidationError('learnerRoleId must be one of the scenario roles', 'learnerRoleId');
        if (current.personas.some((p) => p.roleId === body.learnerRoleId)) {
          throw new ValidationError('the learner cannot play a side a persona plays', 'learnerRoleId');
        }
      }
      data.learnerRoleId = body.learnerRoleId;
    }
  } catch (error) {
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
    throw error;
  }

  if (Object.keys(data).length === 0 && roleUpdates.length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    for (const u of roleUpdates) {
      await tx.role.update({ where: { id: u.id }, data: { name: u.name, description: u.description } });
    }
    if (Object.keys(data).length > 0) await tx.scenario.update({ where: { id }, data });
  });

  return NextResponse.json({ ok: true });
}
