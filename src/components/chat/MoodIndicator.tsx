'use client';

import { type MoodType, MOOD_STATES, DEFAULT_MOOD } from '@/types';

interface MoodConfig {
  label: string;
  /** Background class for the small mood dot. */
  dot: string;
}

/** Calm mood words with a small dot: greys for guarded moods, indigo for warming ones. */
export const MOOD_CONFIG: Record<MoodType, MoodConfig> = {
  neutral:     { label: 'Neutral',     dot: 'bg-px-on-2' },
  firm:        { label: 'Firm',        dot: 'bg-px-on' },
  skeptical:   { label: 'Skeptical',   dot: 'bg-amber-600 dark:bg-amber-500' },
  interested:  { label: 'Interested',  dot: 'bg-[#6f86c9]' },
  impressed:   { label: 'Impressed',   dot: 'bg-[#9fb2e6]' },
  frustrated:  { label: 'Frustrated',  dot: 'bg-red-700 dark:bg-red-500' },
  considering: { label: 'Considering', dot: 'bg-[#4f66ad]' },
};

interface MoodIndicatorProps {
  mood: MoodType | string | null | undefined;
  showLabel?: boolean;
}

export function MoodIndicator({ mood, showLabel = false }: MoodIndicatorProps) {
  const validMood = (mood && (MOOD_STATES as readonly string[]).includes(mood) ? mood : DEFAULT_MOOD) as MoodType;
  const config = MOOD_CONFIG[validMood];

  return (
    <span className="inline-flex items-center gap-2" title={config.label}>
      <span
        className={`inline-block w-2 h-2 shrink-0 rounded-full ${config.dot}`}
        data-testid="mood-indicator"
        data-mood={validMood}
        aria-hidden={showLabel ? true : undefined}
      />
      {showLabel && (
        <span className="text-sm font-medium" data-testid="mood-label">
          {config.label}
        </span>
      )}
    </span>
  );
}
