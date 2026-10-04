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
      <main className="min-h-screen overflow-x-hidden bg-px-paper text-px-ink flex items-center p-5 sm:p-12">
        <div className="w-full max-w-2xl mx-auto border-t-4 border-px-ink pt-6">
          <p className="text-4xl sm:text-5xl font-bold leading-[0.98] tracking-[-0.02em] [font-stretch:72%] [text-wrap:balance]" data-testid="share-missing">
            This scenario link is not active.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center min-h-11 font-bold underline underline-offset-4 decoration-2 hover:text-px-cloth"
          >
            What is Persuaider?
          </Link>
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

  const primaryButton =
    'inline-flex items-center justify-center min-h-12 px-7 py-3.5 bg-px-cloth text-px-on-cloth font-bold text-base text-center hover:bg-px-cloth-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-cloth';

  return (
    <main className="min-h-screen overflow-x-hidden bg-px-paper text-px-ink">
      <div className="max-w-3xl mx-auto px-5 sm:px-12 py-10 sm:py-16" data-testid="share-page">
        <p className="text-xs sm:text-sm font-extrabold uppercase tracking-[0.04em] [font-stretch:125%] text-px-ink-2">
          A Persuaider scenario{scenario.createdBy?.username ? ` from ${scenario.createdBy.username}` : ''}
        </p>
        <h1
          className="mt-4 border-t-4 border-px-ink pt-5 text-[2.75rem] sm:text-6xl font-bold leading-[0.95] tracking-[-0.02em] [font-stretch:72%] [text-wrap:balance] break-words"
          data-testid="share-title"
        >
          {scenario.title}
        </h1>
        <p className="mt-5 font-serif text-lg leading-relaxed text-px-ink-2 max-w-[60ch]">{scenario.description}</p>
        <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-1">
          <div className="bg-px-field text-px-on p-5" data-testid="share-you-play-panel">
            <dt className="text-xs font-bold uppercase tracking-[0.06em] text-px-on-2">You play</dt>
            <dd className="mt-2 text-3xl font-bold leading-none [font-stretch:72%] break-words" data-testid="share-you-play">{learnerRole}</dd>
          </div>
          <div className="bg-px-field text-px-on p-5" data-testid="share-against-panel">
            <dt className="text-xs font-bold uppercase tracking-[0.06em] text-px-on-2">Against</dt>
            <dd className="mt-2 text-3xl font-bold leading-none [font-stretch:72%] break-words" data-testid="share-against">
              {otherSides.length > 0 ? otherSides.join(', ') : scenario.aiRole}
            </dd>
          </div>
        </dl>
        <div className="mt-4 space-y-1 text-sm text-px-ink-2">
          {scenario.personas.length > 0 && <p>Counterparts to choose from: {scenario.personas.map((p) => p.name).join(', ')}</p>}
          {scenario._count.members >= 1 && (
            <p>{scenario._count.members === 1 ? '1 person has joined.' : `${scenario._count.members} people have joined.`}</p>
          )}
        </div>
        <p className="mt-8 font-serif text-lg leading-relaxed max-w-[60ch]" data-testid="share-what">
          You will chat with an AI playing the other side. It holds a hidden walk-away it will not cross. When you stop,
          you see what you got, what you left on the table, and what to change. About ten minutes.
        </p>

        <div className="mt-8">
          {session && isMember ? (
            <Link href="/dashboard" className={primaryButton} data-testid="share-open-dashboard">
              You already have this scenario. Open dashboard
            </Link>
          ) : session ? (
            <JoinButton joinCode={code} needsAccessCode={!!scenario.accessCode} autoJoin={join === '1'} />
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
              <Link
                href={`/register?redirect_url=${encodeURIComponent(sharePath(code, true))}`}
                className={primaryButton}
                data-testid="share-signup"
              >
                Sign up and practise
              </Link>
              <Link
                href={`/login?redirect_url=${encodeURIComponent(sharePath(code, true))}`}
                className="inline-flex items-center justify-center min-h-12 px-2 font-bold underline underline-offset-4 decoration-2 hover:text-px-cloth"
                data-testid="share-signin"
              >
                I have an account
              </Link>
            </div>
          )}
        </div>
        <p className="mt-8 border-t border-px-ink/30 pt-4 font-serif text-sm text-px-ink-2">
          Your side&apos;s confidential brief and the hidden numbers appear only once you have joined.
        </p>
      </div>
    </main>
  );
}
