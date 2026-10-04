import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { prisma } from '@/lib/db/client';
import { safeRedirect } from '@/lib/auth/redirect';

export const metadata: Metadata = { title: 'Sign up · Persuaider' };

/**
 * Clerk's form in the public pages' palette. The values are CSS variables, so the
 * box follows the light/dark class on <html> without a reload.
 */
const appearance = {
  variables: {
    colorPrimary: 'var(--px-cloth)',
    colorPrimaryForeground: 'var(--px-on-cloth)',
    colorBackground: 'var(--px-paper)',
    colorForeground: 'var(--px-ink)',
    colorMutedForeground: 'var(--px-ink-2)',
    colorMuted: 'var(--px-paper-2)',
    colorInput: 'var(--px-paper)',
    colorInputForeground: 'var(--px-ink)',
    colorNeutral: 'var(--px-ink)',
    colorBorder: 'var(--px-ink-2)',
    colorRing: 'var(--px-cloth)',
    colorShadow: 'transparent',
    fontFamily: 'var(--font-archivo), ui-sans-serif, system-ui, sans-serif',
    fontFamilyButtons: 'var(--font-archivo), ui-sans-serif, system-ui, sans-serif',
    borderRadius: '0',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full max-w-full rounded-none border-2 border-px-ink shadow-none',
    card: 'rounded-none shadow-none',
    formFieldInput: 'min-h-11 text-base',
    formButtonPrimary: 'min-h-12 font-bold text-base',
  },
};

/** The published scenario's title when the return address is a share link. */
async function scenarioTitleFor(target: string): Promise<string | null> {
  const match = /^\/s\/([^/?#]+)/.exec(target);
  if (!match) return null;
  let code: string;
  try {
    code = decodeURIComponent(match[1]).trim().toUpperCase();
  } catch {
    return null;
  }
  const scenario = await prisma.scenario
    .findUnique({ where: { joinCode: code }, select: { title: true, status: true } })
    .catch(() => null);
  return scenario && scenario.status === 'published' ? scenario.title : null;
}

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
          <SignUp routing="hash" forceRedirectUrl={target} fallbackRedirectUrl={target} appearance={appearance} />
        </div>
      </div>
    </main>
  );
}
