/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    return React.createElement('img', { ...props, 'data-testid': props['data-testid'] || 'mock-image' });
  },
}));

// Mock FileUpload
jest.mock('@/components/ui/FileUpload', () => ({
  FileUpload: ({ onFileSelect, onError }: { onFileSelect: (f: File) => void; onError?: (e: string) => void }) => (
    <div data-testid="file-upload-mock">
      <button
        data-testid="trigger-upload"
        onClick={() => onFileSelect(new File(['test'], 'avatar.png', { type: 'image/png' }))}
      >
        Upload
      </button>
      <button
        data-testid="trigger-error"
        onClick={() => onError?.('File too large')}
      >
        Error
      </button>
    </div>
  ),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { PersonaAvatarUpload } from '@/components/personas/PersonaAvatarUpload';

describe('PersonaAvatarUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the upload area', () => {
    render(
      <PersonaAvatarUpload
        personaId="p1"
        personaName="Alice"
        currentAvatarUrl={null}
        onAvatarChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('persona-avatar-upload')).toBeInTheDocument();
    expect(screen.getByTestId('file-upload-mock')).toBeInTheDocument();
  });

  it('shows DiceBear avatar when no custom avatar', () => {
    render(
      <PersonaAvatarUpload
        personaId="p1"
        personaName="Alice"
        currentAvatarUrl={null}
        onAvatarChange={jest.fn()}
      />
    );
    const img = screen.getByTestId('avatar-preview');
    expect(img).toHaveAttribute('src', expect.stringContaining('dicebear.com'));
    expect(img).toHaveAttribute('src', expect.stringContaining('seed=Alice'));
  });

  it('shows custom avatar when avatarUrl is provided', () => {
    render(
      <PersonaAvatarUpload
        personaId="p1"
        personaName="Alice"
        currentAvatarUrl="/uploads/custom.jpg"
        onAvatarChange={jest.fn()}
      />
    );
    const img = screen.getByTestId('avatar-preview');
    expect(img).toHaveAttribute('src', '/uploads/custom.jpg');
  });

  it('shows remove button when custom avatar exists', () => {
    render(
      <PersonaAvatarUpload
        personaId="p1"
        personaName="Alice"
        currentAvatarUrl="/uploads/custom.jpg"
        onAvatarChange={jest.fn()}
      />
    );
    expect(screen.getByTestId('remove-avatar-button')).toBeInTheDocument();
  });

  it('does not show remove button when no custom avatar', () => {
    render(
      <PersonaAvatarUpload
        personaId="p1"
        personaName="Alice"
        currentAvatarUrl={null}
        onAvatarChange={jest.fn()}
      />
    );
    expect(screen.queryByTestId('remove-avatar-button')).not.toBeInTheDocument();
  });

  it('calls onAvatarChange after successful upload', async () => {
    const onAvatarChange = jest.fn();
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ url: '/uploads/new.png' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ persona: {} }) });

    render(
      <PersonaAvatarUpload
        personaId="p1"
        personaName="Alice"
        currentAvatarUrl={null}
        onAvatarChange={onAvatarChange}
      />
    );

    fireEvent.click(screen.getByTestId('trigger-upload'));

    await waitFor(() => {
      expect(onAvatarChange).toHaveBeenCalledWith('/uploads/new.png');
    });
  });

  it('shows error message on upload failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'File too large' }),
    });

    render(
      <PersonaAvatarUpload
        personaId="p1"
        personaName="Alice"
        currentAvatarUrl={null}
        onAvatarChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('trigger-upload'));

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument();
    });
  });

  it('shows error from FileUpload onError callback', () => {
    render(
      <PersonaAvatarUpload
        personaId="p1"
        personaName="Alice"
        currentAvatarUrl={null}
        onAvatarChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('trigger-error'));
    expect(screen.getByTestId('upload-error')).toHaveTextContent('File too large');
  });

  it('calls onAvatarChange(null) after removing avatar', async () => {
    const onAvatarChange = jest.fn();
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ persona: {} }) });

    render(
      <PersonaAvatarUpload
        personaId="p1"
        personaName="Alice"
        currentAvatarUrl="/uploads/custom.jpg"
        onAvatarChange={onAvatarChange}
      />
    );

    fireEvent.click(screen.getByTestId('remove-avatar-button'));

    await waitFor(() => {
      expect(onAvatarChange).toHaveBeenCalledWith(null);
    });
  });
});
