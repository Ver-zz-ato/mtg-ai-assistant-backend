'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { capture } from '@/lib/ph';
import DeckArtLoader from '@/components/DeckArtLoader';
import { EmptySearchState } from '@/components/EmptyStates';

interface Deck {
  id: string;
  title: string;
  commander: string | null;
  format: string | null;
  colors: string[] | null;
  created_at: string;
  owner_username: string;
  card_count: number;
}

const FORMATS = [
  { value: 'all', label: 'All Formats' },
  { value: 'Commander', label: 'Commander' },
  { value: 'Standard', label: 'Standard' },
  { value: 'Modern', label: 'Modern' },
  { value: 'Pioneer', label: 'Pioneer' },
  { value: 'Legacy', label: 'Legacy' },
  { value: 'Vintage', label: 'Vintage' },
  { value: 'Pauper', label: 'Pauper' },
];

const COLORS = [
  { value: 'all', label: 'All Colors', bg: 'bg-neutral-800' },
  { value: 'W', label: 'White', bg: 'bg-yellow-100' },
  { value: 'U', label: 'Blue', bg: 'bg-blue-500' },
  { value: 'B', label: 'Black', bg: 'bg-gray-900' },
  { value: 'R', label: 'Red', bg: 'bg-red-600' },
  { value: 'G', label: 'Green', bg: 'bg-green-600' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'budget', label: 'Budget Friendly' },
  { value: 'expensive', label: 'Highest Value' },
];

export default function BrowseDecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState('all');
  const [colors, setColors] = useState('all');
  const [sort, setSort] = useState('recent');

  useEffect(() => {
    capture('browse_decks_page_view');
  }, []);

  useEffect(() => {
    loadDecks();
  }, [page, format, colors, sort]);

  const loadDecks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '24',
        ...(search && { search }),
        ...(format !== 'all' && { format }),
        ...(colors !== 'all' && { colors }),
        ...(sort && { sort }),
      });

      const res = await fetch(`/api/decks/browse?${params}`);
      const json = await res.json();

      if (json.ok) {
        setDecks(json.decks || []);
        setTotal(json.total || 0);
        setHasMore(json.hasMore || false);
        capture('browse_decks_loaded', {
          count: json.decks?.length || 0,
          filters: { format, colors, sort, search: !!search },
        });
      }
    } catch (error) {
      console.error('Error loading decks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadDecks();
  };

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Browse Public Decks</h1>
        <p className="text-gray-400">
          Explore {total.toLocaleString()}+ community decks. Find inspiration, copy strategies, and share your own!
        </p>
      </div>

      {/* Filters */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
        {/* Search */}
        <form onSubmit={handleSearch} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by deck name, commander, or cards..."
              className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {/* Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Format</label>
            <select
              value={format}
              onChange={(e) => { setFormat(e.target.value); setPage(1); }}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Colors */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Color Identity</label>
            <select
              value={colors}
              onChange={(e) => { setColors(e.target.value); setPage(1); }}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {COLORS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Sort By</label>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1); }}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SORT_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filters */}
        {(format !== 'all' || colors !== 'all' || search) && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-400">Active filters:</span>
            {format !== 'all' && (
              <span className="bg-blue-600/20 border border-blue-600/30 text-blue-300 px-3 py-1 rounded-full text-sm">
                {format}
                <button onClick={() => setFormat('all')} className="ml-2 hover:text-blue-200">×</button>
              </span>
            )}
            {colors !== 'all' && (
              <span className="bg-purple-600/20 border border-purple-600/30 text-purple-300 px-3 py-1 rounded-full text-sm">
                {COLORS.find(c => c.value === colors)?.label}
                <button onClick={() => setColors('all')} className="ml-2 hover:text-purple-200">×</button>
              </span>
            )}
            {search && (
              <span className="bg-amber-600/20 border border-amber-600/30 text-amber-300 px-3 py-1 rounded-full text-sm">
                "{search}"
                <button onClick={() => { setSearch(''); loadDecks(); }} className="ml-2 hover:text-amber-200">×</button>
              </span>
            )}
            <button
              onClick={() => { setFormat('all'); setColors('all'); setSearch(''); setPage(1); }}
              className="text-sm text-red-400 hover:text-red-300 underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden animate-pulse">
              <div className="h-48 bg-neutral-800" />
              <div className="p-4">
                <div className="h-6 bg-neutral-800 rounded mb-2" />
                <div className="h-4 bg-neutral-800 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : decks.length === 0 ? (
        <EmptySearchState query={search} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {decks.map((deck) => (
              <Link
                key={deck.id}
                href={`/decks/public/${deck.id}`}
                onClick={() => capture('browse_deck_clicked', { deck_id: deck.id })}
                className="group bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-blue-600 transition-all transform hover:scale-[1.02]"
              >
                {/* Art */}
                <div className="relative h-48 bg-neutral-950 overflow-hidden">
                  <DeckArtLoader
                    deckId={deck.id}
                    commander={deck.commander || ''}
                    title={deck.title}
                    deckText={''}
                  >
                    {(art, loading) => (
                      art ? (
                        <img src={art} alt="Deck art" className="w-full h-full object-cover" />
                      ) : loading ? (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                          <div className="text-gray-500">Loading...</div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-950">
                          <svg className="w-16 h-16 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                          </svg>
                        </div>
                      )
                    )}
                  </DeckArtLoader>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-bold text-lg text-white mb-1 truncate group-hover:text-blue-400 transition-colors">
                    {deck.title || 'Untitled Deck'}
                  </h3>
                  {deck.commander && (
                    <p className="text-sm text-gray-400 mb-2 truncate">
                      Commander: {deck.commander}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>By {deck.owner_username}</span>
                    <span>{deck.card_count} cards</span>
                  </div>
                  {deck.format && (
                    <div className="mt-2">
                      <span className="inline-block bg-neutral-800 px-2 py-1 rounded text-xs text-gray-300">
                        {deck.format}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {(page > 1 || hasMore) && (
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                ← Previous
              </button>
              <span className="text-gray-400">
                Page {page} {total > 0 && `of ${Math.ceil(total / 24)}`}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
                className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

