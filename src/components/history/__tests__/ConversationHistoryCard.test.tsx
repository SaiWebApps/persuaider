import { render, screen } from '@testing-library/react';
import { ConversationHistoryCard } from '../ConversationHistoryCard';

const baseConversation = {
  id: 'conv-1',
  personaId: 'p1',
  status: 'completed',
  startedAt: '2024-01-15T10:00:00Z',
  completedAt: '2024-01-15T11:00:00Z',
  persona: { name: 'Alex Chen' },
  scenario: { title: 'Salary Negotiation' },
  summary: { overallScore: 85 },
};

jest.mock('next/link', () => {
  function MockLink({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) {
    return <a href={href} {...props}>{children}</a>;
  }
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('ConversationHistoryCard', () => {
  it('renders persona name', () => {
    render(<ConversationHistoryCard conversation={baseConversation} />);
    expect(screen.getByTestId('persona-name')).toHaveTextContent('Alex Chen');
  });

  it('renders scenario title', () => {
    render(<ConversationHistoryCard conversation={baseConversation} />);
    expect(screen.getByTestId('scenario-title')).toHaveTextContent('Salary Negotiation');
  });

  it('shows score for completed conversations', () => {
    render(<ConversationHistoryCard conversation={baseConversation} />);
    expect(screen.getByTestId('score')).toHaveTextContent('85/100');
  });

  it('shows Completed badge for completed conversations', () => {
    render(<ConversationHistoryCard conversation={baseConversation} />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Completed');
  });

  it('shows In Progress badge for active conversations', () => {
    const inProgress = {
      ...baseConversation,
      status: 'in_progress',
      completedAt: null,
      summary: null,
    };
    render(<ConversationHistoryCard conversation={inProgress} />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('In Progress');
  });

  it('does not show score for in-progress conversations', () => {
    const inProgress = {
      ...baseConversation,
      status: 'in_progress',
      completedAt: null,
      summary: null,
    };
    render(<ConversationHistoryCard conversation={inProgress} />);
    expect(screen.queryByTestId('score')).not.toBeInTheDocument();
  });

  it('links to summary page for completed conversations', () => {
    render(<ConversationHistoryCard conversation={baseConversation} />);
    const link = screen.getByTestId('conversation-history-card');
    expect(link).toHaveAttribute('href', '/persona/p1/summary');
  });

  it('links to chat page for in-progress conversations', () => {
    const inProgress = {
      ...baseConversation,
      status: 'in_progress',
      completedAt: null,
      summary: null,
    };
    render(<ConversationHistoryCard conversation={inProgress} />);
    const link = screen.getByTestId('conversation-history-card');
    expect(link).toHaveAttribute('href', '/persona/p1/chat');
  });
});
