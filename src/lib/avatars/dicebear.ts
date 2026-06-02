const DICEBEAR_BASE = 'https://api.dicebear.com/7.x';
const DEFAULT_STYLE = 'personas';

/**
 * Generates a deterministic DiceBear avatar URL from a persona name.
 * No API calls — pure URL construction.
 * Same name always produces the same avatar.
 */
export function generateAvatarUrl(name: string, style?: string): string {
  const trimmed = (name ?? '').trim();
  const seed = encodeURIComponent(trimmed || 'default');
  return `${DICEBEAR_BASE}/${style || DEFAULT_STYLE}/svg?seed=${seed}`;
}
