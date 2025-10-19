'use client';

import React, { useState } from 'react';

/**
 * Advanced Filters Modal for Browse Decks
 * 
 * Additional filters beyond format/colors/sort:
 * - Average Mana Value range
 * - Has specific card types (Artifacts, Enchantments, Planeswalkers, etc.)
 * - Deck age (Last updated)
 * - Popularity (likes/views)
 * - Budget range (estimated deck value)
 */

export interface AdvancedFilters {
  mvMin: number | null;
  mvMax: number | null;
  hasArtifacts: boolean;
  hasEnchantments: boolean;
  hasPlaneswalkers: boolean;
  hasInstants: boolean;
  hasSorceries: boolean;
  ageFilter: 'all' | 'day' | 'week' | 'month' | 'year';
  popularityMin: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
}

interface AdvancedFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: AdvancedFilters;
  onApply: (filters: AdvancedFilters) => void;
}

export function AdvancedFiltersModal({ 
  isOpen, 
  onClose, 
  filters, 
  onApply 
}: AdvancedFiltersModalProps) {
  const [localFilters, setLocalFilters] = useState<AdvancedFilters>(filters);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters: AdvancedFilters = {
      mvMin: null,
      mvMax: null,
      hasArtifacts: false,
      hasEnchantments: false,
      hasPlaneswalkers: false,
      hasInstants: false,
      hasSorceries: false,
      ageFilter: 'all',
      popularityMin: null,
      budgetMin: null,
      budgetMax: null,
    };
    setLocalFilters(resetFilters);
    onApply(resetFilters);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Advanced Filters</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Mana Value Range */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Average Mana Value Range
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Min</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={localFilters.mvMin || ''}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, mvMin: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={localFilters.mvMax || ''}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, mvMax: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10.0"
                />
              </div>
            </div>
          </div>

          {/* Card Types */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Must Include Card Types
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { key: 'hasArtifacts', label: 'Artifacts', emoji: '⚙️' },
                { key: 'hasEnchantments', label: 'Enchantments', emoji: '✨' },
                { key: 'hasPlaneswalkers', label: 'Planeswalkers', emoji: '👤' },
                { key: 'hasInstants', label: 'Instants', emoji: '⚡' },
                { key: 'hasSorceries', label: 'Sorceries', emoji: '🔥' },
              ].map((type) => (
                <button
                  key={type.key}
                  onClick={() =>
                    setLocalFilters({
                      ...localFilters,
                      [type.key]: !localFilters[type.key as keyof AdvancedFilters],
                    })
                  }
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    localFilters[type.key as keyof AdvancedFilters]
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-neutral-950 border-neutral-700 text-gray-300 hover:border-neutral-600'
                  }`}
                >
                  <span className="mr-2">{type.emoji}</span>
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Deck Age */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Last Updated
            </label>
            <select
              value={localFilters.ageFilter}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, ageFilter: e.target.value as AdvancedFilters['ageFilter'] })
              }
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Any time</option>
              <option value="day">Last 24 hours</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="year">Last year</option>
            </select>
          </div>

          {/* Popularity */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Minimum Likes
            </label>
            <input
              type="number"
              min="0"
              value={localFilters.popularityMin || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, popularityMin: e.target.value ? Number(e.target.value) : null })
              }
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
            <p className="text-xs text-gray-500 mt-1">Show only decks with at least this many likes</p>
          </div>

          {/* Budget Range */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Budget Range (USD)
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Min</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={localFilters.budgetMin || ''}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, budgetMin: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="$0"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Max</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={localFilters.budgetMax || ''}
                  onChange={(e) =>
                    setLocalFilters({ ...localFilters, budgetMax: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="$∞"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">Filter by estimated deck value</p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-neutral-900 border-t border-neutral-800 p-6 flex gap-3 justify-end">
          <button
            onClick={handleReset}
            className="px-6 py-2 border border-neutral-700 text-gray-300 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            Reset All
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 border border-neutral-700 text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

export const defaultAdvancedFilters: AdvancedFilters = {
  mvMin: null,
  mvMax: null,
  hasArtifacts: false,
  hasEnchantments: false,
  hasPlaneswalkers: false,
  hasInstants: false,
  hasSorceries: false,
  ageFilter: 'all',
  popularityMin: null,
  budgetMin: null,
  budgetMax: null,
};


