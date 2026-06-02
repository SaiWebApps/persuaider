import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { HistoryClient } from './HistoryClient';

// Reads per-request user data from the database; opt out of static prerendering.
export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    include: {
      persona: {
        select: { id: true, name: true },
      },
      scenario: {
        select: { id: true, title: true },
      },
      summary: {
        select: { overallScore: true },
      },
    },
    orderBy: { startedAt: 'desc' },
  });

  const serialized = conversations.map((c) => ({
    id: c.id,
    personaId: c.personaId,
    status: c.status,
    startedAt: c.startedAt.toISOString(),
    completedAt: c.completedAt?.toISOString() || null,
    persona: c.persona,
    scenario: c.scenario,
    summary: c.summary,
  }));

  return <HistoryClient conversations={serialized} />;
}
