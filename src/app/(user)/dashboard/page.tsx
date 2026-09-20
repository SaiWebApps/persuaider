import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/client';
import { DashboardClient } from './DashboardClient';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { SignOutButton } from '@clerk/nextjs';

// Reads per-request user data from the database; opt out of static prerendering.
export const dynamic = 'force-dynamic';

const NOTICES: Record<string, string> = {
  'join-required': 'Join a scenario before practicing with its personas. Use a join code below or pick one from Explore.',
  'persona-missing': 'That persona no longer exists.',
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const noticeText = notice ? NOTICES[notice] : undefined;
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
  });

  // Fetch scenarios the user has joined
  const memberships = await prisma.userScenario.findMany({
    where: { userId: session.user.id },
    include: {
      scenario: {
        include: {
          personas: {
            orderBy: { displayOrder: 'asc' },
            select: {
              id: true,
              name: true,
              description: true,
              roleType: true,
              role: { select: { id: true, name: true } },
            },
          },
          roles: { orderBy: { displayOrder: 'asc' }, select: { id: true, name: true } },
        },
      },
    },
  });

  // Fetch user's conversations to determine persona status
  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      personaId: true,
      scenarioId: true,
      status: true,
    },
  });

  // Build scenarios with personas and their statuses
  const scenarios = memberships.map((m) => ({
    id: m.scenarioId,
    title: m.scenario.title,
    description: m.scenario.description,
    userRole: m.scenario.userRole,
    aiRole: m.scenario.aiRole,
    // The side the learner plays: the first scenario role no persona plays (null without roles).
    learnerRoleName:
      m.scenario.roles.length > 0
        ? (m.scenario.roles.find((r) => !m.scenario.personas.some((p) => p.role?.id === r.id))?.name ?? null)
        : null,
    personas: m.scenario.personas.map((persona) => {
      const conversation = conversations.find(
        (c) => c.personaId === persona.id && c.scenarioId === m.scenarioId
      );
      let status: 'available' | 'in_progress' | 'completed' = 'available';
      if (conversation) {
        status = conversation.status === 'completed' ? 'completed' : 'in_progress';
      }
      return {
        ...persona,
        status,
        conversationId: conversation?.id,
      };
    }),
  }));

  const hasCompleted = scenarios.some((s) =>
    s.personas.some((p) => p.status === 'completed')
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold text-indigo-600">Persuaider</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Welcome, {user?.username || 'User'}
              </span>
              {session.user.role === 'admin' && (
                <Link
                  href="/admin"
                  className="px-3 py-1.5 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 rounded-md hover:bg-purple-200 dark:hover:bg-purple-800/50"
                >
                  Admin
                </Link>
              )}
              <ThemeToggle />
              <SignOutButton>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Sign Out
                </button>
              </SignOutButton>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Your Training Dashboard
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Practice your negotiation skills against AI counterparts.
                  Select a persona within a scenario to begin.
                </p>
              </div>
              {hasCompleted && (
                <a
                  href="/api/export/pdf"
                  target="_blank"
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Download Report
                </a>
              )}
            </div>
          </div>

          {noticeText && (
            <div
              role="status"
              data-testid="dashboard-notice"
              className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {noticeText}
            </div>
          )}

          <DashboardClient scenarios={scenarios} />
        </div>
      </main>
    </div>
  );
}
