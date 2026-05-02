import { render, screen, fireEvent } from '@testing-library/react';
import { PersonaGrid } from '../personas/PersonaGrid';
import type { PersonaWithStatus } from '../personas/PersonaGrid';

const personas: PersonaWithStatus[] = [
  {
    id: 'p1',
    name: 'Alex Chen',
    description: 'Hiring manager',
    roleType: 'Manager',
    status: 'available',
  },
  {
    id: 'p2',
    name: 'Sarah Lee',
    description: 'VP of Engineering',
    roleType: 'Executive',
    status: 'in_progress',
    conversationId: 'conv-1',
  },
  {
    id: 'p3',
    name: 'Tom Smith',
    description: 'HR Director',
    roleType: 'HR',
    status: 'completed',
  },
];

describe('PersonaGrid', () => {
  it('renders all persona cards', () => {
    render(<PersonaGrid personas={personas} onPersonaClick={() => {}} />);
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
    expect(screen.getByText('Sarah Lee')).toBeInTheDocument();
    expect(screen.getByText('Tom Smith')).toBeInTheDocument();
  });

  it('shows empty state when no personas', () => {
    render(<PersonaGrid personas={[]} onPersonaClick={() => {}} />);
    expect(screen.getByText(/No personas available yet/)).toBeInTheDocument();
  });

  it('calls onPersonaClick with the clicked persona', () => {
    const handleClick = jest.fn();
    render(<PersonaGrid personas={personas} onPersonaClick={handleClick} />);
    fireEvent.click(screen.getByText('Alex Chen'));
    expect(handleClick).toHaveBeenCalledWith(personas[0]);
  });

  it('passes correct status to each card', () => {
    render(<PersonaGrid personas={personas} onPersonaClick={() => {}} />);
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders correct button text per status', () => {
    render(<PersonaGrid personas={personas} onPersonaClick={() => {}} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.getByText('View Summary')).toBeInTheDocument();
  });

  it('handles personas with extra fields via index signature', () => {
    const extendedPersonas: PersonaWithStatus[] = [
      {
        id: 'p1',
        name: 'Alex',
        description: 'Desc',
        roleType: 'Manager',
        status: 'available',
        scenarioId: 's1',
        scenarioTitle: 'Salary Talk',
      },
    ];
    render(<PersonaGrid personas={extendedPersonas} onPersonaClick={() => {}} />);
    expect(screen.getByText('Alex')).toBeInTheDocument();
  });
});
