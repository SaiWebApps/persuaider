import { render, screen } from '@testing-library/react';
import { MoodIndicator, MOOD_CONFIG } from '../chat/MoodIndicator';
import { MOOD_STATES, DEFAULT_MOOD } from '@/types';

describe('MoodIndicator', () => {
  it('renders a text-free dot carrying each mood key', () => {
    for (const mood of MOOD_STATES) {
      const { unmount } = render(<MoodIndicator mood={mood} />);
      const indicator = screen.getByTestId('mood-indicator');
      expect(indicator).toHaveAttribute('data-mood', mood);
      expect(indicator.textContent).toBe('');
      unmount();
    }
  });

  it('defaults to neutral for null, undefined and unknown moods', () => {
    for (const mood of [null, undefined, 'angry']) {
      const { unmount } = render(<MoodIndicator mood={mood} />);
      expect(screen.getByTestId('mood-indicator')).toHaveAttribute('data-mood', DEFAULT_MOOD);
      unmount();
    }
  });

  it('shows the mood word when showLabel is true', () => {
    for (const mood of MOOD_STATES) {
      const { unmount } = render(<MoodIndicator mood={mood} showLabel />);
      expect(screen.getByTestId('mood-label').textContent).toBe(MOOD_CONFIG[mood].label);
      unmount();
    }
  });

  it('does not show the label by default', () => {
    render(<MoodIndicator mood="firm" />);
    expect(screen.queryByTestId('mood-label')).toBeNull();
  });

  it('has a title for the tooltip', () => {
    render(<MoodIndicator mood="impressed" />);
    expect(screen.getByTitle('Impressed')).toBeInTheDocument();
  });
});
