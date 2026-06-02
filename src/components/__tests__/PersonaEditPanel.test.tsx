/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock next/image as a plain img (defensive; component does not use it directly
// but the mocked children stand in for ones that might).
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) =>
    React.createElement('img', { ...props, 'data-testid': props['data-testid'] || 'mock-image' }),
}));

// Mock PersonaAvatarUpload: a simple stand-in that reflects the props it received
// and lets us trigger the onAvatarChange callback.
jest.mock('@/components/personas/PersonaAvatarUpload', () => ({
  PersonaAvatarUpload: ({
    personaId,
    personaName,
    currentAvatarUrl,
    onAvatarChange,
  }: {
    personaId: string;
    personaName: string;
    currentAvatarUrl: string | null;
    onAvatarChange: (url: string | null) => void;
  }) => (
    <div data-testid="avatar-upload-mock">
      <span data-testid="avatar-upload-id">{personaId}</span>
      <span data-testid="avatar-upload-name">{personaName}</span>
      <span data-testid="avatar-upload-current">{currentAvatarUrl ?? 'none'}</span>
      <button data-testid="avatar-upload-change" onClick={() => onAvatarChange('/uploads/changed.png')}>
        change avatar
      </button>
    </div>
  ),
}));

// Mock PersonaCharacteristicsEditor: a simple stand-in that reflects the value it
// received and lets us trigger the onChange callback with a known value.
jest.mock('@/components/admin/PersonaCharacteristicsEditor', () => ({
  PersonaCharacteristicsEditor: ({
    value,
    onChange,
  }: {
    value: { openness?: number; roleBehavior?: string } | null;
    onChange: (val: { openness: number; concerns: string[]; personality: string[]; roleBehavior: string }) => void;
  }) => (
    <div data-testid="characteristics-editor-mock">
      <span data-testid="characteristics-value">{value ? JSON.stringify(value) : 'null'}</span>
      <button
        data-testid="characteristics-change"
        onClick={() =>
          onChange({ openness: 0.9, concerns: ['budget'], personality: ['skeptical'], roleBehavior: 'pushes back' })
        }
      >
        change characteristics
      </button>
    </div>
  ),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { PersonaEditPanel } from '@/components/admin/PersonaEditPanel';

const STORED_CHARACTERISTICS = JSON.stringify({
  openness: 0.5,
  concerns: ['cost'],
  personality: ['analytical'],
  roleBehavior: 'asks questions',
});

function mockGetSuccess(persona: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ persona }) });
}

describe('PersonaEditPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the loading state before the persona has loaded', () => {
    // A never-resolving fetch keeps the component in its loading state.
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    expect(screen.getByTestId('persona-edit-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('persona-edit-panel')).not.toBeInTheDocument();
  });

  it('GETs /api/personas/{id} on mount and renders the panel with children', async () => {
    mockGetSuccess({ characteristics: STORED_CHARACTERISTICS, avatarUrl: '/uploads/a.png' });

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-edit-panel')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/personas/p1');
    expect(screen.queryByTestId('persona-edit-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('avatar-upload-mock')).toBeInTheDocument();
    expect(screen.getByTestId('characteristics-editor-mock')).toBeInTheDocument();
    expect(screen.getByTestId('save-characteristics-button')).toBeInTheDocument();
  });

  it('parses the persona.characteristics JSON string and passes it to the editor', async () => {
    mockGetSuccess({ characteristics: STORED_CHARACTERISTICS, avatarUrl: null });

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('characteristics-editor-mock')).toBeInTheDocument();
    });

    const value = screen.getByTestId('characteristics-value');
    expect(value).toHaveTextContent('"openness":0.5');
    expect(value).toHaveTextContent('cost');
    expect(value).toHaveTextContent('analytical');
  });

  it('passes avatarUrl and identity props through to PersonaAvatarUpload', async () => {
    mockGetSuccess({ characteristics: null, avatarUrl: '/uploads/custom.jpg' });

    render(<PersonaEditPanel personaId="p42" personaName="Bob" />);

    await waitFor(() => {
      expect(screen.getByTestId('avatar-upload-mock')).toBeInTheDocument();
    });

    expect(screen.getByTestId('avatar-upload-id')).toHaveTextContent('p42');
    expect(screen.getByTestId('avatar-upload-name')).toHaveTextContent('Bob');
    expect(screen.getByTestId('avatar-upload-current')).toHaveTextContent('/uploads/custom.jpg');
  });

  it('treats invalid characteristics JSON as null without crashing', async () => {
    mockGetSuccess({ characteristics: '{not valid json', avatarUrl: null });

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-edit-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('characteristics-value')).toHaveTextContent('null');
  });

  it('shows an error when the GET fails (non-ok response)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Persona not found' }),
    });

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-edit-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('persona-edit-error')).toHaveTextContent('Persona not found');
    expect(screen.queryByTestId('persona-edit-loading')).not.toBeInTheDocument();
  });

  it('shows an error when fetch rejects on load', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-edit-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('persona-edit-error')).toHaveTextContent('network down');
  });

  it('PATCHes the characteristics and shows Saved on success', async () => {
    // 1) initial GET, 2) PATCH save.
    mockGetSuccess({ characteristics: STORED_CHARACTERISTICS, avatarUrl: null });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ persona: {} }) });

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('save-characteristics-button')).toBeInTheDocument();
    });

    // Edit the characteristics so we save a known value.
    fireEvent.click(screen.getByTestId('characteristics-change'));
    fireEvent.click(screen.getByTestId('save-characteristics-button'));

    await waitFor(() => {
      expect(screen.getByTestId('persona-edit-saved')).toBeInTheDocument();
    });

    expect(screen.getByTestId('persona-edit-saved')).toHaveTextContent('Saved');

    const patchCall = mockFetch.mock.calls[1];
    expect(patchCall[0]).toBe('/api/personas/p1');
    expect(patchCall[1].method).toBe('PATCH');
    expect(patchCall[1].headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(patchCall[1].body as string);
    expect(body).toEqual({
      characteristics: { openness: 0.9, concerns: ['budget'], personality: ['skeptical'], roleBehavior: 'pushes back' },
    });
  });

  it('saves the loaded characteristics when none were edited', async () => {
    mockGetSuccess({ characteristics: STORED_CHARACTERISTICS, avatarUrl: null });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ persona: {} }) });

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('save-characteristics-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('save-characteristics-button'));

    await waitFor(() => {
      expect(screen.getByTestId('persona-edit-saved')).toBeInTheDocument();
    });

    const body = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(body.characteristics).toEqual(JSON.parse(STORED_CHARACTERISTICS));
  });

  it('shows an error when the PATCH fails (non-ok response)', async () => {
    mockGetSuccess({ characteristics: STORED_CHARACTERISTICS, avatarUrl: null });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Invalid characteristics' }),
    });

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('save-characteristics-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('save-characteristics-button'));

    await waitFor(() => {
      expect(screen.getByTestId('persona-edit-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('persona-edit-error')).toHaveTextContent('Invalid characteristics');
    expect(screen.queryByTestId('persona-edit-saved')).not.toBeInTheDocument();
  });

  it('shows an error when the PATCH request rejects', async () => {
    mockGetSuccess({ characteristics: STORED_CHARACTERISTICS, avatarUrl: null });
    mockFetch.mockRejectedValueOnce(new Error('save exploded'));

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('save-characteristics-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('save-characteristics-button'));

    await waitFor(() => {
      expect(screen.getByTestId('persona-edit-error')).toHaveTextContent('save exploded');
    });
  });

  it('clears the Saved indicator when characteristics are edited again', async () => {
    mockGetSuccess({ characteristics: STORED_CHARACTERISTICS, avatarUrl: null });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ persona: {} }) });

    render(<PersonaEditPanel personaId="p1" personaName="Alice" />);

    await waitFor(() => {
      expect(screen.getByTestId('save-characteristics-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('save-characteristics-button'));

    await waitFor(() => {
      expect(screen.getByTestId('persona-edit-saved')).toBeInTheDocument();
    });

    // Editing again resets the saved flag.
    fireEvent.click(screen.getByTestId('characteristics-change'));
    expect(screen.queryByTestId('persona-edit-saved')).not.toBeInTheDocument();
  });
});
