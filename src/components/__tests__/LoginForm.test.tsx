import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from '../auth/LoginForm';
import { ThemeProvider } from '../theme/ThemeProvider';

// Mock next-auth
const mockSignIn = jest.fn();
jest.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Mock next/navigation
const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the login form', () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByText('Persuaider')).toBeInTheDocument();
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
  });

  it('renders email and password inputs', () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });

  it('renders a submit button', () => {
    renderWithProviders(<LoginForm />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('has email input of type email', () => {
    renderWithProviders(<LoginForm />);
    const emailInput = screen.getByPlaceholderText('Email address');
    expect(emailInput).toHaveAttribute('type', 'email');
  });

  it('has password input of type password by default', () => {
    renderWithProviders(<LoginForm />);
    const passwordInput = screen.getByPlaceholderText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('toggles password visibility', () => {
    renderWithProviders(<LoginForm />);
    const passwordInput = screen.getByPlaceholderText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Find the toggle button (the one that is not the submit button)
    const buttons = screen.getAllByRole('button');
    const toggleButton = buttons.find(b => b.getAttribute('type') === 'button');
    expect(toggleButton).toBeDefined();
    fireEvent.click(toggleButton as HTMLElement);
    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  it('calls signIn with credentials on submit', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false,
      });
    });
  });

  it('redirects to dashboard on successful login', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('shows error message on failed login', async () => {
    mockSignIn.mockResolvedValue({ error: 'CredentialsSignin' });
    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: 'bad@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  it('shows error on signIn exception', async () => {
    mockSignIn.mockRejectedValue(new Error('Network error'));
    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('An error occurred. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows loading state while submitting', async () => {
    let resolveSignIn: (value: unknown) => void;
    mockSignIn.mockImplementation(() => new Promise((resolve) => { resolveSignIn = resolve; }));
    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Signing in...')).toBeInTheDocument();
    });

    // Resolve to clean up
    (resolveSignIn as (value: unknown) => void)({ error: null });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it('disables inputs while loading', async () => {
    let resolveSignIn: (value: unknown) => void;
    mockSignIn.mockImplementation(() => new Promise((resolve) => { resolveSignIn = resolve; }));
    renderWithProviders(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText('Email address'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Email address')).toBeDisabled();
      expect(screen.getByPlaceholderText('Password')).toBeDisabled();
    });

    (resolveSignIn as (value: unknown) => void)({ error: null });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });
});
