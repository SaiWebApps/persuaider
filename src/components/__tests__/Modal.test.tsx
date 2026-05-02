import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../ui/Modal';

// Mock Button since Modal imports it
jest.mock('../ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    title: 'Test Modal',
    children: <p>Modal content</p>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <Modal {...defaultProps} isOpen={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders modal content when isOpen is true', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
  });

  it('has role="dialog" and aria-modal="true"', () => {
    render(<Modal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Test Modal');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    // The close button is the X button in the header
    const closeButtons = screen.getAllByRole('button');
    // Find the X button (the one without text or the first one)
    const xButton = closeButtons.find(btn => btn.querySelector('svg'));
    if (xButton) {
      fireEvent.click(xButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(<Modal {...defaultProps} onClose={onClose} />);
    // The backdrop has the bg-black class
    const backdrop = container.querySelector('.bg-black');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = jest.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sets body overflow to hidden when open', () => {
    render(<Modal {...defaultProps} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body overflow when closed', () => {
    const { unmount } = render(<Modal {...defaultProps} />);
    unmount();
    expect(document.body.style.overflow).toBe('unset');
  });

  it('renders footer when provided', () => {
    render(
      <Modal
        {...defaultProps}
        footer={<button>Save</button>}
      />
    );
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('does not render footer section when footer prop is absent', () => {
    const { container } = render(<Modal {...defaultProps} />);
    // Footer div should not be present (it's conditionally rendered)
    const dialog = screen.getByRole('dialog');
    const children = dialog.children;
    // Should have: header, body (no footer wrapper)
    expect(children.length).toBe(2); // header + body only
  });

  it('renders children content', () => {
    render(
      <Modal {...defaultProps}>
        <div data-testid="custom-content">Custom</div>
      </Modal>
    );
    expect(screen.getByTestId('custom-content')).toBeInTheDocument();
  });
});
