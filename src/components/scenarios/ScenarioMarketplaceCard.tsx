'use client';

import React from 'react';

export interface ScenarioMarketplaceCardProps {
  id: string;
  title: string;
  description: string;
  userRole: string;
  tags: string[];
  inspirationCount: number;
  memberCount: number;
  personaCount: number;
  isRestricted: boolean;
  creatorUsername: string | null;
  joinCode: string;
  alreadyJoined: boolean;
  onFork: (id: string) => void;
  onJoin: (joinCode: string) => void;
  onTagClick: (tag: string) => void;
}

export function ScenarioMarketplaceCard({
  id,
  title,
  description,
  userRole,
  tags,
  inspirationCount,
  memberCount,
  personaCount,
  isRestricted,
  creatorUsername,
  joinCode,
  alreadyJoined,
  onFork,
  onJoin,
  onTagClick,
}: ScenarioMarketplaceCardProps) {
  const truncatedDescription =
    description && description.length > 100
      ? description.slice(0, 100) + '...'
      : description || '';

  return (
    <div
      data-testid="scenario-marketplace-card"
      className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-5 flex flex-col"
    >
      <div className="flex items-start justify-between mb-2">
        <h3
          data-testid="card-title"
          className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate"
        >
          {title}
        </h3>
        {isRestricted && (
          <span data-testid="lock-icon" className="ml-2 text-amber-500" title="Restricted access">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </span>
        )}
      </div>

      <p
        data-testid="card-description"
        className="text-sm text-gray-600 dark:text-gray-400 mb-3"
      >
        {truncatedDescription}
      </p>

      <p className="text-xs text-gray-500 dark:text-gray-500 mb-2">
        Role: <span className="font-medium">{userRole}</span>
      </p>

      {tags.length > 0 && (
        <div data-testid="tag-pills" className="flex flex-wrap gap-1.5 mb-3">
          {tags.map((tag) => (
            <button
              key={tag}
              data-testid={`tag-${tag}`}
              onClick={() => onTagClick(tag)}
              className="px-2 py-0.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800/50 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div data-testid="stats-row" className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-3">
        <span data-testid="fork-count" title="Times forked">
          {inspirationCount} forks
        </span>
        <span data-testid="member-count">
          {memberCount} members
        </span>
        <span data-testid="persona-count">
          {personaCount} personas
        </span>
      </div>

      {creatorUsername && (
        <p data-testid="creator" className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          By {creatorUsername}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        {alreadyJoined ? (
          <span
            data-testid="joined-badge"
            className="px-3 py-1.5 text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-md"
          >
            Joined
          </span>
        ) : (
          <button
            data-testid="join-button"
            onClick={() => onJoin(joinCode)}
            className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
          >
            Join
          </button>
        )}
        <button
          data-testid="fork-button"
          onClick={() => onFork(id)}
          className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Fork
        </button>
      </div>
    </div>
  );
}
