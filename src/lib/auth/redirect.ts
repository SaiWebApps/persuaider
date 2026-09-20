/**
 * The path a visitor is sent to after signing in or up. Only a same-origin path
 * is honoured; anything else (another site, a protocol-relative URL, a path the
 * URL parser would rewrite into one, empty) falls back to the dashboard, so a
 * crafted link cannot bounce a fresh sign-up elsewhere.
 */
export function safeRedirect(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/')) return fallback;
  // Control characters are stripped by URL parsing, which can turn "/<tab>/x" into "//x".
  for (const ch of value) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c === 0x7f) return fallback;
  }
  try {
    const parsed = new URL(value, 'http://origin.invalid');
    if (parsed.origin !== 'http://origin.invalid') return fallback;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}

/** The public share page for a scenario, optionally asking it to join on arrival. */
export function sharePath(joinCode: string, join = false): string {
  return `/s/${encodeURIComponent(joinCode)}${join ? '?join=1' : ''}`;
}
