import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { safeRedirect } from '@/lib/auth/redirect';
import { authAppearance, scenarioTitleFor } from '@/app/(auth)/_shared/authPage';

export const metadata: Metadata = { title: 'Sign up · Persuaider' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const { redirect_url } = await searchParams;
  const target = safeRedirect(redirect_url);
  const scenarioTitle = await scenarioTitleFor(target);
  return (
    <main className="min-h-screen overflow-x-hidden bg-px-paper text-px-ink" data-testid="signup-page">
      <div className="w-full max-w-md mx-auto px-5 py-8 sm:py-14">
        <p className="text-sm font-extrabold uppercase tracking-[0.04em] [font-stretch:125%]" data-testid="signup-brand">
          Persuaider
        </p>
        {scenarioTitle && (
          <h1
            className="mt-4 border-t-4 border-px-ink pt-4 text-4xl sm:text-5xl font-bold leading-[0.95] tracking-[-0.02em] [font-stretch:72%] [text-wrap:balance] break-words"
            data-testid="signup-scenario-title"
          >
            {scenarioTitle}
          </h1>
        )}
        <div className="mt-6 w-full min-w-0" data-testid="signup-box">
          <SignUp routing="hash" forceRedirectUrl={target} fallbackRedirectUrl={target} appearance={authAppearance} />
        </div>
      </div>
    </main>
  );
}
