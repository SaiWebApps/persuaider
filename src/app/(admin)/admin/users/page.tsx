import { prisma } from '@/lib/db/client';
import { UserTableClient } from '@/components/admin/UserTable';

// Reads from the database on every request; never statically prerender at build time.
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      dailyBudgetUsd: true,
      createdAt: true,
      _count: { select: { conversations: true, scenarioMemberships: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Users</h2>
      </div>
      <UserTableClient initialUsers={users} />
    </div>
  );
}
