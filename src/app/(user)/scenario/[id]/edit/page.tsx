import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { readIssues } from '@/lib/codec/scenario';
import { EditScenarioClient } from './EditScenarioClient';

export const dynamic = 'force-dynamic';

export default async function EditScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const scenario = await prisma.scenario.findUnique({
    where: { id },
    include: { roles: { orderBy: { displayOrder: 'asc' } }, personas: { select: { id: true, name: true, roleId: true } } },
  });
  if (!scenario || (scenario.createdById !== session.user.id && session.user.role !== 'admin')) {
    redirect('/dashboard?notice=not-your-scenario');
  }

  return (
    <EditScenarioClient
      scenario={{
        id: scenario.id,
        title: scenario.title,
        description: scenario.description,
        visibility: scenario.visibility === 'public' ? 'public' : 'unlisted',
        joinCode: scenario.joinCode,
        learnerRoleId: scenario.learnerRoleId,
        roles: scenario.roles.map((r) => ({ id: r.id, name: r.name, description: r.description })),
        personas: scenario.personas,
        issues: readIssues(scenario.issues),
      }}
    />
  );
}
