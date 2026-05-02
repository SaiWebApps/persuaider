import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '../ui/Input';

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders label when label prop is provided', () => {
    render(<Input label="Email" />);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('does not render label when label prop is absent', () => {
    const { container } = render(<Input />);
    expect(container.querySelector('label')).toBeNull();
  });

  it('shows required asterisk when required prop is true', () => {
    render(<Input label="Name" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('displays error message when error prop is provided', () => {
    render(<Input error="This field is required" />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('applies error border styling when error is present', () => {
    render(<Input error="error" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('border-red-300');
  });

  it('applies normal border when no error', () => {
    render(<Input />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('border-gray-300');
  });

  it('handles text input changes', () => {
    const handleChange = jest.fn();
    render(<Input onChange={handleChange} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('is disabled when disabled prop is set', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('shows placeholder text', () => {
    render(<Input placeholder="Enter email" />);
    expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
  });

  describe('password toggle', () => {
    it('shows toggle button for password fields by default', () => {
      render(<Input type="password" />);
      const toggleBtn = screen.getByLabelText('Show password');
      expect(toggleBtn).toBeInTheDocument();
    });

    it('hides toggle button when showPasswordToggle is false', () => {
      render(<Input type="password" showPasswordToggle={false} />);
      expect(screen.queryByLabelText('Show password')).toBeNull();
      expect(screen.queryByLabelText('Hide password')).toBeNull();
    });

    it('does not show toggle for non-password fields', () => {
      render(<Input type="text" />);
      expect(screen.queryByLabelText('Show password')).toBeNull();
    });

    it('toggles password visibility when clicked', () => {
      const { container } = render(<Input type="password" />);
      const input = container.querySelector('input')!;
      expect(input.type).toBe('password');

      const toggleBtn = screen.getByLabelText('Show password');
      fireEvent.click(toggleBtn);

      expect(input.type).toBe('text');
      expect(screen.getByLabelText('Hide password')).toBeInTheDocument();
    });

    it('toggles back to password when clicked again', () => {
      const { container } = render(<Input type="password" />);
      const input = container.querySelector('input')!;

      const toggleBtn = screen.getByLabelText('Show password');
      fireEvent.click(toggleBtn); // show
      fireEvent.click(screen.getByLabelText('Hide password')); // hide

      expect(input.type).toBe('password');
    });
  });

  it('merges custom className', () => {
    render(<Input className="custom-input" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('custom-input');
  });

  it('has displayName set to Input', () => {
    expect(Input.displayName).toBe('Input');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
