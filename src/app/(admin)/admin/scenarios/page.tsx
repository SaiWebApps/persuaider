import { prisma } from '@/lib/db/client';
import { ScenarioTableClient } from '@/components/admin/ScenarioTable';

export default async function AdminScenariosPage() {
  const scenarios = await prisma.scenario.findMany({
    include: {
      personas: { orderBy: { displayOrder: 'asc' }, select: { id: true, name: true, roleType: true } },
      members: { include: { user: { select: { id: true, email: true, username: true } } } },
      _count: { select: { conversations: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const users = await prisma.user.findMany({
    select: { id: true, email: true, username: true },
    orderBy: { username: 'asc' },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Scenarios</h2>
      </div>
      <ScenarioTableClient initialScenarios={scenarios} allUsers={users} />
    </div>
  );
}
