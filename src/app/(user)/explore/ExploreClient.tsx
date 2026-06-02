'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ScenarioMarketplaceCard } from '@/components/scenarios/ScenarioMarketplaceCard';

export interface ExploreScenario {
  id: string;
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  joinCode: string;
  tags: string[];
  inspirationCount: number;
  memberCount: number;
  personaCount: number;
  isRestricted: boolean;
  creatorUsername: string | null;
  alreadyJoined: boolean;
}

interface ExploreClientProps {
  scenarios: ExploreScenario[];
}

export function ExploreClient({ scenarios }: ExploreClientProps) {
  const router = useRouter();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExploreScenario[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    scenarios.forEach((s) => s.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [scenarios]);

  const filteredScenarios = useMemo(() => {
    if (!selectedTag) return scenarios;
    return scenarios.filter((s) => s.tags.includes(selectedTag));
  }, [scenarios, selectedTag]);

  const displayScenarios = searchResults || filteredScenarios;

  const handleTagClick = useCallback((tag: string) => {
    setSearchResults(null);
    setSelectedTag((prev) => (prev === tag ? null : tag));
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() && !selectedTag) return;
    setIsSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedTag) params.set('tag', selectedTag);
      const res = await fetch(`/api/scenarios/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.scenarios);
      } else {
        setError('Search failed. Please try again.');
      }
    } catch {
      setError('Search failed. Please check your connection and try again.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, selectedTag]);

  const handleFork = useCallback(async (scenarioId: string) => {
    if (isActing) return;
    setIsActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/fork`, { method: 'POST' });
      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError('Could not add this scenario to your dashboard. Please try again.');
      }
    } catch {
      setError('Could not add this scenario. Please check your connection and try again.');
    } finally {
      setIsActing(false);
    }
  }, [router, isActing]);

  const handleJoin = useCallback(async (joinCode: string) => {
    if (isActing) return;
    setIsActing(true);
    setError(null);
    try {
      const res = await fetch('/api/scenarios/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode }),
      });
      if (res.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError('Could not join this scenario. The join code may be invalid.');
      }
    } catch {
      setError('Could not join this scenario. Please check your connection and try again.');
    } finally {
      setIsActing(false);
    }
  }, [router, isActing]);

  const clearFilters = useCallback(() => {
    setSelectedTag(null);
    setSearchQuery('');
    setSearchResults(null);
  }, []);

  return (
    <div data-testid="explore-client">
      {error && (
        <div
          data-testid="explore-error"
          role="alert"
          className="mb-4 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}
      <div className="mb-6 flex gap-2">
        <input
          data-testid="search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search scenarios..."
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <button
          data-testid="search-button"
          onClick={handleSearch}
          disabled={isSearching}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
        {(selectedTag || searchResults) && (
          <button
            data-testid="clear-filters"
            onClick={clearFilters}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {allTags.length > 0 && (
        <div data-testid="tag-filter-pills" className="mb-6 flex flex-wrap gap-2">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className={
                'px-3 py-1 text-sm rounded-full transition-colors ' +
                (selectedTag === tag
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600')
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {displayScenarios.length === 0 ? (
        <div data-testid="empty-state" className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg">No scenarios found</p>
          <p className="text-sm mt-1">Try adjusting your search or filters</p>
        </div>
      ) : (
        <div data-testid="scenario-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayScenarios.map((scenario) => (
            <ScenarioMarketplaceCard
              key={scenario.id}
              {...scenario}
              onFork={handleFork}
              onJoin={handleJoin}
              onTagClick={handleTagClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
