import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Public landing page. Signed-in visitors go straight to their dashboard. */
export default async function Home() {
  // force-dynamic above means auth() never throws Next's must-be-dynamic signal here;
  // the catch only covers a Clerk outage, in which case the public page still renders.
  const session = await auth().catch(() => null);
  if (session) redirect('/dashboard');

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <p className="text-sm font-medium text-indigo-600">Persuaider</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Rehearse the negotiation before it happens.</h1>
        <p className="mt-4 text-lg text-gray-700 dark:text-gray-300">
          Describe the situation. Persuaider builds the other side with a hidden walk-away it will not cross,
          lets you practise against it, and then shows you what you got, what you left on the table, and what to change.
        </p>
        <ul className="mt-6 space-y-2 text-gray-700 dark:text-gray-300">
          <li>· An opponent that holds its line instead of folding.</li>
          <li>· A scorecard with real numbers: your target, your walk-away, their limit, your share of the range.</li>
          <li>· Your scenarios stay private unless you share the link.</li>
        </ul>
        <div className="mt-8 flex gap-3">
          <Link href="/register" className="px-5 py-3 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700" data-testid="landing-signup">
            Try it free
          </Link>
          <Link href="/login" className="px-5 py-3 rounded-md border border-gray-300 dark:border-gray-600 font-medium" data-testid="landing-signin">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
