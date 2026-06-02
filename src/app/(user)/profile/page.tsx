import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/client';
import { ProfileClient } from './ProfileClient';

// Reads per-request user data from the database; opt out of static prerendering.
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, email: true },
  });

  if (!user) {
    redirect('/login');
  }

  const totalConversations = await prisma.conversation.count({
    where: { userId: session.user.id },
  });

  const completedConversations = await prisma.conversation.count({
    where: { userId: session.user.id, status: 'completed' },
  });

  const summaries = await prisma.summary.findMany({
    where: {
      conversation: { userId: session.user.id },
    },
    select: { overallScore: true },
  });

  const scores = summaries
    .map((s) => s.overallScore)
    .filter((s): s is number => s !== null);

  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : 0;

  const completionRate = totalConversations > 0
    ? Math.round((completedConversations / totalConversations) * 100)
    : 0;

  return (
    <ProfileClient
      initialUsername={user.username}
      email={user.email}
      stats={{
        totalConversations,
        completedConversations,
        averageScore,
        completionRate,
      }}
    />
  );
}
