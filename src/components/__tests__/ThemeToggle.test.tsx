import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeToggle } from '../theme/ThemeToggle';

// Mock the ThemeProvider context
const mockSetTheme = jest.fn();
let mockTheme = 'system';

jest.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
    resolvedTheme: 'light',
  }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTheme = 'system';
  });

  it('renders a button', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows aria-label with current theme', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('system')
    );
  });

  it('cycles from system to light on click', () => {
    mockTheme = 'system';
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('cycles from light to dark on click', () => {
    mockTheme = 'light';
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('cycles from dark to system on click', () => {
    mockTheme = 'dark';
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });

  it('shows title attribute with current theme', () => {
    mockTheme = 'light';
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Theme: light');
  });

  it('renders an SVG icon', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button.querySelector('svg')).not.toBeNull();
  });
});
