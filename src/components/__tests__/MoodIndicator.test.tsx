import { render, screen } from '@testing-library/react';
import { MoodIndicator, MOOD_CONFIG } from '../chat/MoodIndicator';
import { MOOD_STATES, DEFAULT_MOOD } from '@/types';

describe('MoodIndicator', () => {
  it('renders the correct emoji for each mood', () => {
    for (const mood of MOOD_STATES) {
      const { unmount } = render(<MoodIndicator mood={mood} />);
      const indicator = screen.getByTestId('mood-indicator');
      expect(indicator).toHaveAttribute('data-mood', mood);
      expect(indicator.textContent).toBe(MOOD_CONFIG[mood].emoji);
      unmount();
    }
  });

  it('defaults to neutral for null mood', () => {
    render(<MoodIndicator mood={null} />);
    const indicator = screen.getByTestId('mood-indicator');
    expect(indicator).toHaveAttribute('data-mood', DEFAULT_MOOD);
    expect(indicator.textContent).toBe(MOOD_CONFIG[DEFAULT_MOOD].emoji);
  });

  it('defaults to neutral for undefined mood', () => {
    render(<MoodIndicator mood={undefined} />);
    const indicator = screen.getByTestId('mood-indicator');
    expect(indicator).toHaveAttribute('data-mood', DEFAULT_MOOD);
  });

  it('defaults to neutral for invalid mood string', () => {
    render(<MoodIndicator mood="angry" />);
    const indicator = screen.getByTestId('mood-indicator');
    expect(indicator).toHaveAttribute('data-mood', DEFAULT_MOOD);
  });

  it('shows label when showLabel is true', () => {
    render(<MoodIndicator mood="firm" showLabel />);
    const label = screen.getByTestId('mood-label');
    expect(label.textContent).toBe('Firm');
  });

  it('does not show label by default', () => {
    render(<MoodIndicator mood="firm" />);
    expect(screen.queryByTestId('mood-label')).toBeNull();
  });

  it('applies sm size classes', () => {
    render(<MoodIndicator mood="neutral" size="sm" />);
    const indicator = screen.getByTestId('mood-indicator');
    expect(indicator.className).toContain('w-6');
    expect(indicator.className).toContain('h-6');
  });

  it('applies md size classes by default', () => {
    render(<MoodIndicator mood="neutral" />);
    const indicator = screen.getByTestId('mood-indicator');
    expect(indicator.className).toContain('w-10');
    expect(indicator.className).toContain('h-10');
  });

  it('applies lg size classes', () => {
    render(<MoodIndicator mood="neutral" size="lg" />);
    const indicator = screen.getByTestId('mood-indicator');
    expect(indicator.className).toContain('w-14');
    expect(indicator.className).toContain('h-14');
  });

  it('has accessible aria-label on emoji', () => {
    render(<MoodIndicator mood="skeptical" />);
    const emoji = screen.getByRole('img');
    expect(emoji).toHaveAttribute('aria-label', 'Skeptical');
  });

  it('has title attribute for tooltip', () => {
    render(<MoodIndicator mood="impressed" />);
    const container = screen.getByTitle('Impressed');
    expect(container).toBeInTheDocument();
  });
});
