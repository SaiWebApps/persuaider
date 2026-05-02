import { render, screen, fireEvent } from '@testing-library/react';
import { PersonaCard } from '../personas/PersonaCard';

const basePersona = {
  id: 'p1',
  name: 'Alex Chen',
  description: 'A hiring manager who values data-driven arguments and has budget constraints.',
  roleType: 'Hiring Manager',
};

describe('PersonaCard', () => {
  it('renders persona name', () => {
    render(<PersonaCard persona={basePersona} status="available" onClick={() => {}} />);
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
  });

  it('renders persona description', () => {
    render(<PersonaCard persona={basePersona} status="available" onClick={() => {}} />);
    expect(screen.getByText(basePersona.description)).toBeInTheDocument();
  });

  it('renders persona roleType', () => {
    render(<PersonaCard persona={basePersona} status="available" onClick={() => {}} />);
    expect(screen.getByText('Hiring Manager')).toBeInTheDocument();
  });

  it('renders first letter of name as avatar', () => {
    render(<PersonaCard persona={basePersona} status="available" onClick={() => {}} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows "Available" badge when status is available', () => {
    render(<PersonaCard persona={basePersona} status="available" onClick={() => {}} />);
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('shows "In Progress" badge when status is in_progress', () => {
    render(<PersonaCard persona={basePersona} status="in_progress" onClick={() => {}} />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('shows "Completed" badge when status is completed', () => {
    render(<PersonaCard persona={basePersona} status="completed" onClick={() => {}} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows "Start" button when available', () => {
    render(<PersonaCard persona={basePersona} status="available" onClick={() => {}} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('shows "Continue" button when in_progress', () => {
    render(<PersonaCard persona={basePersona} status="in_progress" onClick={() => {}} />);
    expect(screen.getByText('Continue')).toBeInTheDocument();
  });

  it('shows "View Summary" button when completed', () => {
    render(<PersonaCard persona={basePersona} status="completed" onClick={() => {}} />);
    expect(screen.getByText('View Summary')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', () => {
    const handleClick = jest.fn();
    render(<PersonaCard persona={basePersona} status="available" onClick={handleClick} />);
    fireEvent.click(screen.getByText('Alex Chen'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when in_progress card is clicked', () => {
    const handleClick = jest.fn();
    render(<PersonaCard persona={basePersona} status="in_progress" onClick={handleClick} />);
    fireEvent.click(screen.getByText('Alex Chen'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when completed card is clicked', () => {
    const handleClick = jest.fn();
    render(<PersonaCard persona={basePersona} status="completed" onClick={handleClick} />);
    fireEvent.click(screen.getByText('Alex Chen'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
