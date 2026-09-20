import Link from 'next/link';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/client';
import { sharePath } from '@/lib/auth/redirect';
import { JoinButton } from './JoinButton';

export const dynamic = 'force-dynamic';

async function loadShared(code: string) {
  return prisma.scenario.findUnique({
    where: { joinCode: code },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      accessCode: true,
      userRole: true,
      aiRole: true,
      learnerRoleId: true,
      roles: { orderBy: { displayOrder: 'asc' }, select: { id: true, name: true } },
      personas: { orderBy: { displayOrder: 'asc' }, select: { name: true } },
      createdBy: { select: { username: true } },
      _count: { select: { members: true } },
    },
  });
}

/** Title and description for link previews in chat apps, so a pasted link is not a bare URL. */
export async function generateMetadata({ params }: { params: Promise<{ joinCode: string }> }): Promise<Metadata> {
  const { joinCode } = await params;
  const scenario = await loadShared(joinCode.trim().toUpperCase());
  if (!scenario || scenario.status !== 'published') return { title: 'Persuaider' };
  const description = `Practise this negotiation against an AI counterpart: ${scenario.description.slice(0, 160)}`;
  return {
    title: `${scenario.title} · Persuaider`,
    description,
    openGraph: { title: scenario.title, description, siteName: 'Persuaider', type: 'website' },
  };
}

/**
 * A shareable scenario page: what it is and who you play, without any confidential
 * brief or number. Signed-out visitors are sent to sign up and come back with
 * ?join=1, which joins on arrival; signed-in visitors join with one click.
 */
export default async function SharedScenarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ joinCode: string }>;
  searchParams: Promise<{ join?: string }>;
}) {
  const { joinCode } = await params;
  const { join } = await searchParams;
  const code = joinCode.trim().toUpperCase();

  const scenario = await loadShared(code);
  if (!scenario || scenario.status !== 'published') {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-gray-700 dark:text-gray-300" data-testid="share-missing">This scenario link is not active.</p>
          <Link href="/" className="mt-4 inline-block text-indigo-600 hover:underline">What is Persuaider?</Link>
        </div>
      </main>
    );
  }

  const session = await auth().catch(() => null);
  const isMember = session
    ? !!(await prisma.userScenario.findFirst({ where: { userId: session.user.id, scenarioId: scenario.id }, select: { id: true } }))
    : false;

  const learnerRole = scenario.roles.find((r) => r.id === scenario.learnerRoleId)?.name ?? scenario.userRole;
  const otherSides = scenario.roles.filter((r) => r.id !== scenario.learnerRoleId).map((r) => r.name);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="max-w-2xl mx-auto px-6 py-16" data-testid="share-page">
        <p className="text-sm font-medium text-indigo-600">A Persuaider scenario{scenario.createdBy?.username ? ` from ${scenario.createdBy.username}` : ''}</p>
        <h1 className="mt-2 text-3xl font-bold" data-testid="share-title">{scenario.title}</h1>
        <p className="mt-3 text-gray-700 dark:text-gray-300">{scenario.description}</p>
        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
            <dt className="text-gray-500 dark:text-gray-400">You play</dt>
            <dd className="font-medium" data-testid="share-you-play">{learnerRole}</dd>
          </div>
          <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
            <dt className="text-gray-500 dark:text-gray-400">Against</dt>
            <dd className="font-medium">{otherSides.length > 0 ? otherSides.join(', ') : scenario.aiRole}</dd>
          </div>
        </dl>
        {scenario.personas.length > 0 && (
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Counterparts to choose from: {scenario.personas.map((p) => p.name).join(', ')}
          </p>
        )}
        {scenario._count.members >= 3 && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{scenario._count.members} people have joined.</p>
        )}
        <p className="mt-6 text-gray-800 dark:text-gray-200" data-testid="share-what">
          You will chat with an AI playing the other side. It holds a hidden walk-away it will not cross. When you stop,
          you see what you got, what you left on the table, and what to change. About ten minutes.
        </p>

        <div className="mt-8">
          {session && isMember ? (
            <Link href="/dashboard" className="inline-block px-5 py-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700" data-testid="share-open-dashboard">
              You already have this scenario. Open dashboard
            </Link>
          ) : session ? (
            <JoinButton joinCode={code} needsAccessCode={!!scenario.accessCode} autoJoin={join === '1'} />
          ) : (
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/register?redirect_url=${encodeURIComponent(sharePath(code, true))}`}
                className="px-5 py-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                data-testid="share-signup"
              >
                Sign up and practise
              </Link>
              <Link
                href={`/login?redirect_url=${encodeURIComponent(sharePath(code, true))}`}
                className="px-5 py-3 rounded-md border border-gray-300 dark:border-gray-600 font-medium"
                data-testid="share-signin"
              >
                I have an account
              </Link>
            </div>
          )}
        </div>
        <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">Your side&apos;s confidential brief and the hidden numbers appear only once you have joined.</p>
      </div>
    </main>
  );
}
