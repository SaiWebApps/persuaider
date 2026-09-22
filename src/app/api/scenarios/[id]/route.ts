import type { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/types';
import { parseIssuesInput, parseVisibilityInput, serialize } from '@/lib/codec/scenario';

/**
 * A creator (or an admin) can read and edit their own scenario: title, description,
 * visibility, sides (name and confidential brief), which side the learner plays,
 * and the hidden Issue numbers. The same validation as creation applies.
 */

async function loadEditable(id: string, userId: string, role: string, db: Prisma.TransactionClient = prisma) {
  const scenario = await db.scenario.findUnique({
    where: { id },
    include: { roles: { orderBy: { displayOrder: 'asc' } }, personas: { select: { id: true, name: true, roleId: true } } },
  });
  if (!scenario) return { status: 404 as const };
  if (scenario.createdById !== userId && role !== 'admin') return { status: 404 as const }; // no existence leak
  return { status: 200 as const, scenario };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const loaded = await loadEditable(id, session.user.id, session.user.role);
  if (loaded.status !== 200) return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  return prisma.$transaction(async (tx) => {
    let current = loaded.scenario;
    const draftIds = [`${id}:legacy-user`, `${id}:legacy-ai`];
    // Serialize legacy initialization and retries against the parent row. Re-read
    // after locking so concurrent saves see the first transaction's Role rows.
    if (current.roles.length === 0 || current.roles.some((r) => draftIds.includes(r.id))) {
      await tx.$queryRaw`SELECT id FROM scenarios WHERE id = ${id} FOR UPDATE`;
      const locked = await loadEditable(id, session.user.id, session.user.role, tx);
      if (locked.status !== 200) return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
      current = locked.scenario;
    }
    const initializing = current.roles.length === 0 && body.roles !== undefined;
    const editableRoles = initializing
      ? draftIds.map((roleId, index) => ({ id: roleId, name: index === 0 ? current.userRole : current.aiRole }))
      : current.roles;
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
        if (issues.length > 0 && editableRoles.length !== 2) throw new ValidationError('issues need exactly two sides (roles)', 'roles');
        data.issues = serialize(issues);
      }
      if (body.roles !== undefined) {
        if (!Array.isArray(body.roles)) throw new ValidationError('roles must be an array', 'roles');
        if (initializing && (body.roles.length !== 2 || !draftIds.every((roleId) => body.roles.some((r: { id?: string } | null) => r?.id === roleId)))) {
          throw new ValidationError('legacy scenarios need both default sides', 'roles');
        }
        for (const r of body.roles) {
          const existing = editableRoles.find((x) => x.id === r?.id);
          if (!existing) throw new ValidationError('roles: unknown role id', 'roles');
          if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 100) throw new ValidationError('roles: name must be 1–100 characters', 'roles');
          if (typeof r.description !== 'string' || r.description.length > 5000) throw new ValidationError('roles: description must be at most 5000 characters', 'roles');
          roleUpdates.push({ id: existing.id, name: r.name.trim(), description: r.description });
        }
        const names = editableRoles.map((x) => roleUpdates.find((u) => u.id === x.id)?.name ?? x.name).map((n) => n.toLowerCase());
        if (new Set(names).size !== names.length) throw new ValidationError('roles must have distinct names', 'roles');
      }
      if (body.learnerRoleId !== undefined) {
        if (body.learnerRoleId !== null) {
          if (!editableRoles.some((r) => r.id === body.learnerRoleId)) throw new ValidationError('learnerRoleId must be one of the scenario roles', 'learnerRoleId');
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

    if (initializing) {
      for (const role of roleUpdates) {
        await tx.role.create({ data: { ...role, scenarioId: id, displayOrder: draftIds.indexOf(role.id) + 1 } });
      }
      data.learnerRoleId = body.learnerRoleId === undefined ? draftIds[0] : body.learnerRoleId;
    }
    const learnerRoleId = data.learnerRoleId === undefined ? current.learnerRoleId : data.learnerRoleId as string | null;
    for (const u of roleUpdates) {
      if (!initializing) await tx.role.update({ where: { id: u.id }, data: { name: u.name, description: u.description } });
      // The side's name is copied into the prompt inputs; keep them in step.
      const renamed = editableRoles.find((r) => r.id === u.id)!.name !== u.name;
      if (renamed) {
        await tx.persona.updateMany({ where: { roleId: u.id }, data: { roleType: u.name } });
        if (u.id === learnerRoleId) data.userRole = u.name;
        else if (current.personas.some((p) => p.roleId === u.id)) data.aiRole = u.name;
      }
    }
    // Legacy Persona links are intentionally left alone: roleType/name are not
    // sufficient evidence to assign a Persona to either side.
    if (editableRoles.length === 2 && editableRoles.every((r) => draftIds.includes(r.id))) {
      const learner = editableRoles.find((r) => r.id === learnerRoleId);
      const counterpart = editableRoles.find((r) => r.id !== learnerRoleId);
      if (learner && counterpart) {
        data.userRole = roleUpdates.find((r) => r.id === learner.id)?.name ?? learner.name;
        data.aiRole = roleUpdates.find((r) => r.id === counterpart.id)?.name ?? counterpart.name;
      }
    }
    if (Object.keys(data).length > 0) await tx.scenario.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  });
}
