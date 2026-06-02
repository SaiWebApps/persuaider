import { render, screen, fireEvent } from '@testing-library/react';
import { ScenarioMarketplaceCard } from '../ScenarioMarketplaceCard';

const baseProps = {
  id: 's1',
  title: 'Salary Negotiation',
  description: 'Practice negotiating your salary with a hiring manager who has budget constraints and competing candidates.',
  userRole: 'Job Candidate',
  tags: ['negotiation', 'salary', 'career'],
  inspirationCount: 5,
  memberCount: 12,
  personaCount: 3,
  isRestricted: false,
  creatorUsername: 'jane_doe',
  joinCode: 'ABC123',
  alreadyJoined: false,
  onFork: jest.fn(),
  onJoin: jest.fn(),
  onTagClick: jest.fn(),
};

describe('ScenarioMarketplaceCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title', () => {
    render(<ScenarioMarketplaceCard {...baseProps} />);
    expect(screen.getByTestId('card-title')).toHaveTextContent('Salary Negotiation');
  });

  it('renders truncated description (100 chars)', () => {
    render(<ScenarioMarketplaceCard {...baseProps} />);
    const desc = screen.getByTestId('card-description');
    expect(desc.textContent!.length).toBeLessThanOrEqual(103); // 100 + '...'
    expect(desc.textContent).toContain('...');
  });

  it('renders full description when under 100 chars', () => {
    render(<ScenarioMarketplaceCard {...baseProps} description='Short desc' />);
    expect(screen.getByTestId('card-description')).toHaveTextContent('Short desc');
  });

  it('renders tag pills', () => {
    render(<ScenarioMarketplaceCard {...baseProps} />);
    expect(screen.getByTestId('tag-pills')).toBeInTheDocument();
    expect(screen.getByText('negotiation')).toBeInTheDocument();
    expect(screen.getByText('salary')).toBeInTheDocument();
    expect(screen.getByText('career')).toBeInTheDocument();
  });

  it('shows fork count', () => {
    render(<ScenarioMarketplaceCard {...baseProps} />);
    expect(screen.getByTestId('fork-count')).toHaveTextContent('5 forks');
  });

  it('shows member count', () => {
    render(<ScenarioMarketplaceCard {...baseProps} />);
    expect(screen.getByTestId('member-count')).toHaveTextContent('12 members');
  });

  it('shows persona count', () => {
    render(<ScenarioMarketplaceCard {...baseProps} />);
    expect(screen.getByTestId('persona-count')).toHaveTextContent('3 personas');
  });

  it('shows creator username', () => {
    render(<ScenarioMarketplaceCard {...baseProps} />);
    expect(screen.getByTestId('creator')).toHaveTextContent('By jane_doe');
  });

  it('shows Join button when not already joined', () => {
    render(<ScenarioMarketplaceCard {...baseProps} />);
    expect(screen.getByTestId('join-button')).toBeInTheDocument();
    expect(screen.queryByTestId('joined-badge')).not.toBeInTheDocument();
  });

  it('shows Joined badge when alreadyJoined', () => {
    render(<ScenarioMarketplaceCard {...baseProps} alreadyJoined={true} />);
    expect(screen.getByTestId('joined-badge')).toHaveTextContent('Joined');
    expect(screen.queryByTestId('join-button')).not.toBeInTheDocument();
  });

  it('shows lock icon when restricted', () => {
    render(<ScenarioMarketplaceCard {...baseProps} isRestricted={true} />);
    expect(screen.getByTestId('lock-icon')).toBeInTheDocument();
  });

  it('does not show lock icon when not restricted', () => {
    render(<ScenarioMarketplaceCard {...baseProps} isRestricted={false} />);
    expect(screen.queryByTestId('lock-icon')).not.toBeInTheDocument();
  });

  it('Fork button triggers onFork callback with id', () => {
    const onFork = jest.fn();
    render(<ScenarioMarketplaceCard {...baseProps} onFork={onFork} />);
    fireEvent.click(screen.getByTestId('fork-button'));
    expect(onFork).toHaveBeenCalledWith('s1');
  });

  it('Join button triggers onJoin callback with joinCode', () => {
    const onJoin = jest.fn();
    render(<ScenarioMarketplaceCard {...baseProps} onJoin={onJoin} />);
    fireEvent.click(screen.getByTestId('join-button'));
    expect(onJoin).toHaveBeenCalledWith('ABC123');
  });

  it('tag click triggers onTagClick callback', () => {
    const onTagClick = jest.fn();
    render(<ScenarioMarketplaceCard {...baseProps} onTagClick={onTagClick} />);
    fireEvent.click(screen.getByText('salary'));
    expect(onTagClick).toHaveBeenCalledWith('salary');
  });

  it('renders no tag pills div when tags array is empty', () => {
    render(<ScenarioMarketplaceCard {...baseProps} tags={[]} />);
    expect(screen.queryByTestId('tag-pills')).not.toBeInTheDocument();
  });

  it('does not show creator when creatorUsername is null', () => {
    render(<ScenarioMarketplaceCard {...baseProps} creatorUsername={null} />);
    expect(screen.queryByTestId('creator')).not.toBeInTheDocument();
  });

  it('renders stats row', () => {
    render(<ScenarioMarketplaceCard {...baseProps} />);
    expect(screen.getByTestId('stats-row')).toBeInTheDocument();
  });
});
