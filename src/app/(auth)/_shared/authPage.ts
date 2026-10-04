import { prisma } from '@/lib/db/client';

/**
 * Clerk's form in the public pages' palette. The values are CSS variables, so the
 * box follows the light/dark class on <html> without a reload.
 */
export const authAppearance = {
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
export async function scenarioTitleFor(target: string): Promise<string | null> {
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
