import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GenerateScenarioModal } from '../GenerateScenarioModal';

// Mock the UI components
jest.mock('@/components/ui/Modal', () => ({
  Modal: ({ isOpen, onClose, title, children, footer }: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <div>{children}</div>
        {footer && <div data-testid="modal-footer">{footer}</div>}
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));

jest.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('@/components/ui/FileUpload', () => ({
  FileUpload: ({ onFileSelect }: { onFileSelect: (file: File) => void; onError?: (err: string) => void; accept?: string; maxSizeMB?: number }) => (
    <div data-testid="file-upload">
      <button onClick={() => onFileSelect(new File(['content'], 'test.pdf', { type: 'application/pdf' }))}>
        Select File
      </button>
    </div>
  ),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const MOCK_SCENARIO = {
  title: 'Generated Scenario',
  description: 'A generated scenario',
  userRole: 'Negotiator',
  aiRole: 'Counterpart',
  initialGreeting: 'Hello',
  evaluationCriteria: { frameworks: [], scoringInstructions: '' },
  winCondition: { type: 'manual', maxMessages: 20 },
  roles: [],
  personas: [
    { name: 'Alice', description: 'Test', roleType: 'Manager', initialGreeting: 'Hi', characteristics: { openness: 0.5, concerns: [], personality: [], roleBehavior: '' } },
  ],
};

describe('GenerateScenarioModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSave: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <GenerateScenarioModal {...defaultProps} isOpen={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders tabs (Describe / Upload Document)', () => {
    render(<GenerateScenarioModal {...defaultProps} />);
    expect(screen.getByTestId('tab-describe')).toBeInTheDocument();
    expect(screen.getByTestId('tab-upload')).toBeInTheDocument();
    expect(screen.getByText('Describe')).toBeInTheDocument();
    expect(screen.getByText('Upload Document')).toBeInTheDocument();
  });

  it('Generate button disabled when description is empty', () => {
    render(<GenerateScenarioModal {...defaultProps} />);
    const button = screen.getByTestId('generate-button');
    expect(button).toBeDisabled();
  });

  it('Generate button enabled when description has content', () => {
    render(<GenerateScenarioModal {...defaultProps} />);
    const textarea = screen.getByTestId('description-input');
    fireEvent.change(textarea, { target: { value: 'A salary negotiation scenario' } });
    const button = screen.getByTestId('generate-button');
    expect(button).not.toBeDisabled();
  });

  it('shows loading state during generation', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<GenerateScenarioModal {...defaultProps} />);
    const textarea = screen.getByTestId('description-input');
    fireEvent.change(textarea, { target: { value: 'A test scenario description' } });
    const button = screen.getByTestId('generate-button');
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    });
  });

  it('displays generated scenario fields after successful generation', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ scenario: MOCK_SCENARIO }),
    });
    render(<GenerateScenarioModal {...defaultProps} />);
    const textarea = screen.getByTestId('description-input');
    fireEvent.change(textarea, { target: { value: 'A test scenario description' } });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('scenario-preview')).toBeInTheDocument();
    });
    expect(screen.getByTestId('edit-title')).toHaveValue('Generated Scenario');
    expect(screen.getByTestId('edit-user-role')).toHaveValue('Negotiator');
    expect(screen.getByTestId('edit-ai-role')).toHaveValue('Counterpart');
  });

  it('Save button calls onSave with scenario data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ scenario: MOCK_SCENARIO }),
    });
    const onSave = jest.fn();
    render(<GenerateScenarioModal {...defaultProps} onSave={onSave} />);
    const textarea = screen.getByTestId('description-input');
    fireEvent.change(textarea, { target: { value: 'A test scenario description' } });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('save-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('save-button'));
    expect(onSave).toHaveBeenCalledWith(MOCK_SCENARIO);
  });

  it('shows error message on generation failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Generation failed. Please try again.' }),
    });
    render(<GenerateScenarioModal {...defaultProps} />);
    const textarea = screen.getByTestId('description-input');
    fireEvent.change(textarea, { target: { value: 'A test scenario description' } });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
    expect(screen.getByText('Generation failed. Please try again.')).toBeInTheDocument();
  });

  it('switches to Upload tab and shows file upload', () => {
    render(<GenerateScenarioModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('tab-upload'));
    expect(screen.getByTestId('file-upload')).toBeInTheDocument();
  });

  it('shows persona list in preview', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ scenario: MOCK_SCENARIO }),
    });
    render(<GenerateScenarioModal {...defaultProps} />);
    fireEvent.change(screen.getByTestId('description-input'), { target: { value: 'Test scenario' } });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('persona-0')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('(Manager)')).toBeInTheDocument();
  });

  it('allows editing the title in preview', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ scenario: MOCK_SCENARIO }),
    });
    const onSave = jest.fn();
    render(<GenerateScenarioModal {...defaultProps} onSave={onSave} />);
    fireEvent.change(screen.getByTestId('description-input'), { target: { value: 'Test scenario' } });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-title')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId('edit-title'), { target: { value: 'New Title' } });
    fireEvent.click(screen.getByTestId('save-button'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Title' }));
  });
});
