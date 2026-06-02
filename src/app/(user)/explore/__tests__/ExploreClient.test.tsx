/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock next/navigation useRouter
const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock the heavy marketplace card child. Expose buttons that invoke the
// callbacks passed by ExploreClient so we can drive fork/join from tests.
jest.mock('@/components/scenarios/ScenarioMarketplaceCard', () => ({
  ScenarioMarketplaceCard: ({
    id,
    title,
    joinCode,
    onFork,
    onJoin,
    onTagClick,
    tags,
  }: {
    id: string;
    title: string;
    joinCode: string;
    onFork: (id: string) => void;
    onJoin: (joinCode: string) => void;
    onTagClick: (tag: string) => void;
    tags: string[];
  }) => (
    <div data-testid={`card-${id}`}>
      <span data-testid={`card-title-${id}`}>{title}</span>
      <button data-testid={`fork-${id}`} onClick={() => onFork(id)}>
        Fork
      </button>
      <button data-testid={`join-${id}`} onClick={() => onJoin(joinCode)}>
        Join
      </button>
      {tags.map((t) => (
        <button
          key={t}
          aria-label={`cardtag ${id} ${t}`}
          data-testid={`cardtag-${id}-${t}`}
          onClick={() => onTagClick(t)}
        />
      ))}
    </div>
  ),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { ExploreClient } from '../ExploreClient';
import type { ExploreScenario } from '../ExploreClient';

function makeScenario(overrides: Partial<ExploreScenario> = {}): ExploreScenario {
  return {
    id: 's1',
    title: 'Salary Negotiation',
    description: 'Practice negotiating a raise',
    userRole: 'Employee',
    aiRole: 'Manager',
    joinCode: 'JOIN-1',
    tags: ['work', 'negotiation'],
    inspirationCount: 3,
    memberCount: 5,
    personaCount: 2,
    isRestricted: false,
    creatorUsername: 'alice',
    alreadyJoined: false,
    ...overrides,
  };
}

const scenarios: ExploreScenario[] = [
  makeScenario({ id: 's1', title: 'Salary Negotiation', tags: ['work', 'negotiation'], joinCode: 'JOIN-1' }),
  makeScenario({ id: 's2', title: 'Job Interview', tags: ['work', 'interview'], joinCode: 'JOIN-2' }),
  makeScenario({ id: 's3', title: 'Buying a Car', tags: ['shopping'], joinCode: 'JOIN-3' }),
];

describe('ExploreClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the explore client container and all scenario cards', () => {
    render(<ExploreClient scenarios={scenarios} />);
    expect(screen.getByTestId('explore-client')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-grid')).toBeInTheDocument();
    expect(screen.getByTestId('card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('card-s2')).toBeInTheDocument();
    expect(screen.getByTestId('card-s3')).toBeInTheDocument();
  });

  it('renders the search input and search button, and no error initially', () => {
    render(<ExploreClient scenarios={scenarios} />);
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('search-button')).toBeInTheDocument();
    expect(screen.queryByTestId('explore-error')).not.toBeInTheDocument();
  });

  it('renders tag filter pills built from the union of all scenario tags (sorted)', () => {
    render(<ExploreClient scenarios={scenarios} />);
    const pills = screen.getByTestId('tag-filter-pills');
    expect(pills).toBeInTheDocument();
    // Distinct tags across scenarios: interview, negotiation, shopping, work
    expect(screen.getByRole('button', { name: 'work' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'negotiation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'interview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'shopping' })).toBeInTheDocument();
  });

  it('filters scenarios when a tag pill is clicked', () => {
    render(<ExploreClient scenarios={scenarios} />);
    // Click the "shopping" tag pill (only s3 has it)
    fireEvent.click(screen.getByRole('button', { name: 'shopping' }));
    expect(screen.getByTestId('card-s3')).toBeInTheDocument();
    expect(screen.queryByTestId('card-s1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-s2')).not.toBeInTheDocument();
  });

  it('clears the tag filter when the same pill is clicked again', () => {
    render(<ExploreClient scenarios={scenarios} />);
    const shopping = screen.getByRole('button', { name: 'shopping' });
    fireEvent.click(shopping);
    expect(screen.queryByTestId('card-s1')).not.toBeInTheDocument();
    fireEvent.click(shopping);
    // All cards visible again
    expect(screen.getByTestId('card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('card-s2')).toBeInTheDocument();
    expect(screen.getByTestId('card-s3')).toBeInTheDocument();
  });

  it('shows the clear-filters button once a tag is selected and clears all filters', () => {
    render(<ExploreClient scenarios={scenarios} />);
    expect(screen.queryByTestId('clear-filters')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'work' }));
    const clear = screen.getByTestId('clear-filters');
    expect(clear).toBeInTheDocument();
    fireEvent.click(clear);
    // After clearing, the button disappears and all cards return
    expect(screen.queryByTestId('clear-filters')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('card-s2')).toBeInTheDocument();
    expect(screen.getByTestId('card-s3')).toBeInTheDocument();
  });

  it('does not search when query is empty and no tag selected', () => {
    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.click(screen.getByTestId('search-button'));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('explore-error')).not.toBeInTheDocument();
  });

  it('search success populates the grid with the returned scenarios', async () => {
    const results: ExploreScenario[] = [
      makeScenario({ id: 'r1', title: 'Result One', joinCode: 'JOIN-R1' }),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scenarios: results }),
    });

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'one' } });
    fireEvent.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('card-r1')).toBeInTheDocument();
    });
    // Original scenarios replaced by the search results
    expect(screen.queryByTestId('card-s1')).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/scenarios/search?')
    );
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('q=one'));
  });

  it('search also triggers via Enter key in the input', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scenarios: [makeScenario({ id: 'r9', title: 'Enter Result' })] }),
    });

    render(<ExploreClient scenarios={scenarios} />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByTestId('card-r9')).toBeInTheDocument();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('search failure (response not ok) shows the explore-error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'boom' } });
    fireEvent.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('explore-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-error')).toHaveTextContent(/Search failed/i);
  });

  it('search rejection (thrown/network error) shows the explore-error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'net' } });
    fireEvent.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('explore-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-error')).toHaveTextContent(/connection/i);
  });

  it('fork success POSTs to the fork endpoint and routes to /dashboard', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.click(screen.getByTestId('fork-s2'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/scenarios/s2/fork', { method: 'POST' });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('fork failure (response not ok) shows the explore-error and does not route', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.click(screen.getByTestId('fork-s1'));

    await waitFor(() => {
      expect(screen.getByTestId('explore-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-error')).toHaveTextContent(/Could not add/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('fork rejection (thrown error) shows a connection error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.click(screen.getByTestId('fork-s1'));

    await waitFor(() => {
      expect(screen.getByTestId('explore-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-error')).toHaveTextContent(/connection/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('join success POSTs the join code and routes to /dashboard', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.click(screen.getByTestId('join-s3'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/scenarios/join',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode: 'JOIN-3' }),
      })
    );
  });

  it('join failure (response not ok) shows the explore-error and does not route', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.click(screen.getByTestId('join-s1'));

    await waitFor(() => {
      expect(screen.getByTestId('explore-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-error')).toHaveTextContent(/Could not join/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('join rejection (thrown error) shows a connection error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.click(screen.getByTestId('join-s2'));

    await waitFor(() => {
      expect(screen.getByTestId('explore-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('explore-error')).toHaveTextContent(/connection/i);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the empty state when there are no scenarios at all', () => {
    render(<ExploreClient scenarios={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('scenario-grid')).not.toBeInTheDocument();
    // No tags means no filter pills
    expect(screen.queryByTestId('tag-filter-pills')).not.toBeInTheDocument();
  });

  it('shows the empty state when a tag filter matches no scenarios after search clears it', async () => {
    // Search returns an empty result set -> empty state shown
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scenarios: [] }),
    });

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'nomatch' } });
    fireEvent.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('scenario-grid')).not.toBeInTheDocument();
  });

  it('search includes the selected tag param when a tag is active', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scenarios: [makeScenario({ id: 'rt', title: 'Tagged' })] }),
    });

    render(<ExploreClient scenarios={scenarios} />);
    fireEvent.click(screen.getByRole('button', { name: 'work' }));
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'role' } });
    fireEvent.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('tag=work'));
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('q=role'));
  });
});
