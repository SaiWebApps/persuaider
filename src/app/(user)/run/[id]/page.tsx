import { auth } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import { getRunView } from '@/lib/run/run';
import { RunViewer } from '@/components/run/RunViewer';
import { NotFoundError } from '@/types';

// Reads per-request run data from the database; opt out of static prerendering.
export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  let view;
  try {
    view = await getRunView(id, session.user.id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <RunViewer
      runId={view.id}
      scenarioTitle={view.scenarioTitle}
      personaName={view.personaName}
      learnerSide={view.learnerSide}
      counterpartSide={view.counterpartSide}
      maxMessages={view.maxMessages}
      initialState={view.state}
    />
  );
}
