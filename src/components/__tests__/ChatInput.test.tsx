import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChatInput } from '../chat/ChatInput';

jest.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

describe('ChatInput', () => {
  const mockSendMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMessage.mockResolvedValue(undefined);
  });

  it('renders textarea and send button', () => {
    render(<ChatInput onSendMessage={mockSendMessage} />);
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('shows placeholder text', () => {
    render(<ChatInput onSendMessage={mockSendMessage} />);
    expect(screen.getByTestId('chat-input')).toHaveAttribute('placeholder', expect.stringContaining('Type your message'));
  });

  it('disables send button when message is empty', () => {
    render(<ChatInput onSendMessage={mockSendMessage} />);
    expect(screen.getByText('Send')).toBeDisabled();
  });

  it('enables send button when message has content', () => {
    render(<ChatInput onSendMessage={mockSendMessage} />);
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Hello' } });
    expect(screen.getByText('Send')).not.toBeDisabled();
  });

  it('calls onSendMessage with trimmed content on submit', async () => {
    render(<ChatInput onSendMessage={mockSendMessage} />);
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: '  Hello world  ' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('Hello world');
    });
  });

  it('clears textarea after successful send', async () => {
    render(<ChatInput onSendMessage={mockSendMessage} />);
    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });
    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });

  it('disables textarea when disabled prop is true', () => {
    render(<ChatInput onSendMessage={mockSendMessage} disabled />);
    expect(screen.getByTestId('chat-input')).toBeDisabled();
  });

  it('shows keyboard shortcut tip', () => {
    render(<ChatInput onSendMessage={mockSendMessage} />);
    expect(screen.getByText(/Press Enter to send/)).toBeInTheDocument();
  });

  it('does not send when disabled', () => {
    render(<ChatInput onSendMessage={mockSendMessage} disabled />);
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Hello' } });
    expect(screen.getByText('Send')).toBeDisabled();
  });

  it('handles send failure without crashing', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSendMessage.mockRejectedValue(new Error('Network error'));
    render(<ChatInput onSendMessage={mockSendMessage} />);
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'Hello' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });
    consoleSpy.mockRestore();
  });
});
