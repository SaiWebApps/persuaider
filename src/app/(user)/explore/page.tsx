import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/client';
import { ExploreClient } from './ExploreClient';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { SignOutButton } from '@clerk/nextjs';

// Reads per-request user data from the database; opt out of static prerendering.
export const dynamic = 'force-dynamic';

export default async function ExplorePage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true },
  });

  const joinedIds = await prisma.userScenario.findMany({
    where: { userId: session.user.id },
    select: { scenarioId: true },
  });
  const joinedSet = new Set(joinedIds.map((j) => j.scenarioId));

  const scenarios = await prisma.scenario.findMany({
    where: { visibility: 'public', status: 'published' },
    include: {
      _count: { select: { personas: true, members: true } },
      createdBy: { select: { username: true } },
    },
    orderBy: [{ inspirationCount: 'desc' }, { createdAt: 'desc' }],
  });

  const scenarioData = scenarios.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    userRole: s.userRole,
    aiRole: s.aiRole,
    joinCode: s.joinCode,
    tags: JSON.parse(s.tags || '[]') as string[],
    inspirationCount: s.inspirationCount,
    personaCount: s._count.personas,
    memberCount: s._count.members,
    isRestricted: !!s.accessCode,
    creatorUsername: s.createdBy?.username || null,
    alreadyJoined: joinedSet.has(s.id),
  }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-bold text-indigo-600">Persuaider</h1>
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Dashboard
              </Link>
              <Link
                href="/explore"
                className="px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 rounded-md"
              >
                Explore
              </Link>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {user?.username || 'User'}
              </span>
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
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Explore Scenarios
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Discover and fork public negotiation scenarios from the community.
            </p>
          </div>

          <ExploreClient scenarios={scenarioData} />
        </div>
      </main>
    </div>
  );
}
