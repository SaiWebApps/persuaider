import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { safeRedirect } from '@/lib/auth/redirect';
import { authAppearance, scenarioTitleFor } from '@/app/(auth)/_shared/authPage';

export const metadata: Metadata = { title: 'Sign in · Persuaider' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const { redirect_url } = await searchParams;
  const target = safeRedirect(redirect_url);
  const scenarioTitle = await scenarioTitleFor(target);
  return (
    <main className="min-h-screen overflow-x-hidden bg-px-paper text-px-ink" data-testid="signin-page">
      <div className="w-full max-w-md mx-auto px-5 py-8 sm:py-14">
        <p className="text-sm font-extrabold uppercase tracking-[0.04em] [font-stretch:125%]" data-testid="signin-brand">
          Persuaider
        </p>
        {scenarioTitle && (
          <h1
            className="mt-4 border-t-4 border-px-ink pt-4 text-4xl sm:text-5xl font-bold leading-[0.95] tracking-[-0.02em] [font-stretch:72%] [text-wrap:balance] break-words"
            data-testid="signin-scenario-title"
          >
            {scenarioTitle}
          </h1>
        )}
        <div className="mt-6 w-full min-w-0" data-testid="signin-box">
          <SignIn routing="hash" forceRedirectUrl={target} fallbackRedirectUrl={target} appearance={authAppearance} />
        </div>
      </div>
    </main>
  );
}
