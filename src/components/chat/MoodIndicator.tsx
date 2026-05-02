'use client';

import { type MoodType, MOOD_STATES, DEFAULT_MOOD } from '@/types';

interface MoodConfig {
  label: string;
  emoji: string;
  imagePath: string;
  color: string;
}

export const MOOD_CONFIG: Record<MoodType, MoodConfig> = {
  neutral:     { label: 'Neutral',     emoji: '😐', imagePath: '/moods/neutral.svg',     color: 'text-gray-500' },
  firm:        { label: 'Firm',        emoji: '😤', imagePath: '/moods/firm.svg',        color: 'text-red-600' },
  skeptical:   { label: 'Skeptical',   emoji: '🤨', imagePath: '/moods/skeptical.svg',   color: 'text-amber-600' },
  interested:  { label: 'Interested',  emoji: '🧐', imagePath: '/moods/interested.svg',  color: 'text-blue-500' },
  impressed:   { label: 'Impressed',   emoji: '😮', imagePath: '/moods/impressed.svg',   color: 'text-green-500' },
  frustrated:  { label: 'Frustrated',  emoji: '😠', imagePath: '/moods/frustrated.svg',  color: 'text-red-500' },
  considering: { label: 'Considering', emoji: '🤔', imagePath: '/moods/considering.svg', color: 'text-purple-500' },
};

interface MoodIndicatorProps {
  mood: MoodType | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function MoodIndicator({ mood, size = 'md', showLabel = false }: MoodIndicatorProps) {
  const validMood = (mood && (MOOD_STATES as readonly string[]).includes(mood) ? mood : DEFAULT_MOOD) as MoodType;
  const config = MOOD_CONFIG[validMood];

  const sizeClasses = {
    sm: 'w-6 h-6 text-base',
    md: 'w-10 h-10 text-2xl',
    lg: 'w-14 h-14 text-4xl',
  };

  return (
    <div className="flex items-center gap-2" title={config.label}>
      <div
        className={`${sizeClasses[size]} flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700`}
        data-testid="mood-indicator"
        data-mood={validMood}
      >
        <span role="img" aria-label={config.label}>{config.emoji}</span>
      </div>
      {showLabel && (
        <span className={`text-xs font-medium ${config.color}`} data-testid="mood-label">
          {config.label}
        </span>
      )}
    </div>
  );
}
