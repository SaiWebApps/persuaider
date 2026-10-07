import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../chat/ChatMessage';

describe('ChatMessage', () => {
  const baseTimestamp = new Date('2025-01-15T10:30:00');

  it('renders user message content', () => {
    render(
      <ChatMessage role="user" content="Hello there" timestamp={baseTimestamp} />
    );
    expect(screen.getByText('Hello there')).toBeInTheDocument();
  });

  it('renders assistant message content', () => {
    render(
      <ChatMessage role="assistant" content="Hi, how can I help?" timestamp={baseTimestamp} personaName="Alex" />
    );
    expect(screen.getByText('Hi, how can I help?')).toBeInTheDocument();
  });

  it('shows "You" label for user messages', () => {
    render(
      <ChatMessage role="user" content="test" timestamp={baseTimestamp} />
    );
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('shows persona name for assistant messages', () => {
    render(
      <ChatMessage role="assistant" content="test" timestamp={baseTimestamp} personaName="Alex Chen" />
    );
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
  });

  it('shows "AI" when no personaName provided for assistant', () => {
    render(
      <ChatMessage role="assistant" content="test" timestamp={baseTimestamp} />
    );
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  it('renders multiline content with whitespace preserved', () => {
    render(
      <ChatMessage role="user" content={"Line 1\nLine 2\nLine 3"} timestamp={baseTimestamp} />
    );
    const messageEl = screen.getByText(/Line 1/);
    expect(messageEl).toHaveClass('whitespace-pre-wrap');
  });

  it('labels the sender of each bubble', () => {
    const { unmount } = render(<ChatMessage role="user" content="a" timestamp={baseTimestamp} personaName="Alex" />);
    expect(screen.getByTestId('message-sender').textContent).toBe('You');
    unmount();
    render(<ChatMessage role="assistant" content="b" timestamp={baseTimestamp} personaName="Alex Chen" />);
    expect(screen.getByTestId('message-sender').textContent).toBe('Alex Chen');
  });

  it('carries no mood face or dot on bubbles', () => {
    render(<ChatMessage role="assistant" content="test" timestamp={baseTimestamp} personaName="Alex" />);
    expect(screen.queryByTestId('mood-indicator')).toBeNull();
  });
});
