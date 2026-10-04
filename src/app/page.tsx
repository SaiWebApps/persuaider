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
    <main className="min-h-screen overflow-x-hidden bg-px-paper text-px-ink flex flex-col">
      <div className="w-full max-w-6xl mx-auto px-5 sm:px-12 pt-8 sm:pt-10">
        <p className="text-sm font-extrabold uppercase tracking-[0.04em] [font-stretch:125%]">Persuaider</p>
      </div>

      <section className="w-full max-w-6xl mx-auto px-5 sm:px-12 pt-16 sm:pt-24 pb-10 sm:pb-14 grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-8">
        <h1 className="lg:col-span-11 max-w-[17ch] text-[3.25rem] sm:text-7xl lg:text-8xl font-bold leading-[0.94] tracking-[-0.02em] [font-stretch:72%] [text-wrap:balance]">
          Rehearse the negotiation before it happens.
        </h1>
        <p className="lg:col-span-7 font-serif text-lg sm:text-xl leading-relaxed text-px-ink-2 max-w-[40ch]">
          Describe the situation. Persuaider builds the other side with a hidden walk-away it will not cross,
          lets you practise against it, and then shows you what you got, what you left on the table, and what to change.
        </p>
        <div className="lg:col-span-12 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <Link
            href="/register"
            className="inline-flex items-center justify-center min-h-12 px-7 py-3.5 bg-px-cloth text-px-on-cloth font-bold text-base hover:bg-px-cloth-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-cloth"
            data-testid="landing-signup"
          >
            Try it free
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center min-h-12 px-7 py-3.5 border-2 border-px-ink text-px-ink font-bold text-base hover:bg-px-ink hover:text-px-paper transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-px-ink"
            data-testid="landing-signin"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="mt-auto bg-px-field text-px-on">
        <div className="max-w-6xl mx-auto px-5 sm:px-12 py-10 sm:py-14 grid grid-cols-1 lg:grid-cols-12 gap-x-6">
          <ul className="lg:col-start-6 lg:col-span-7 font-serif text-base sm:text-lg leading-snug" data-testid="landing-benefits">
            <li className="py-3.5 border-t-[3px] border-px-on">An opponent that holds its line instead of folding.</li>
            <li className="py-3.5 border-t border-px-on/30 text-px-on-2">A scorecard with real numbers: your target, your walk-away, their limit, your share of the range.</li>
            <li className="py-3.5 border-t border-px-on/30 text-px-on-2">Your scenarios stay private unless you share the link.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
