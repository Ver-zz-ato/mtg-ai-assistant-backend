'use client';

import React, { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { capture } from '@/lib/ph';
import DeckArtLoader from '@/components/DeckArtLoader';
import DeckArtPlaceholder from '@/components/DeckArtPlaceholder';
import { EmptySearchState } from '@/components/EmptyStates';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { dedupFetch } from '@/lib/api/deduplicator';
import { PrefetchLink } from '@/components/PrefetchLink';
import { LazyImage } from '@/components/LazyImage';
import { AdvancedFiltersModal, defaultAdvancedFilters, type AdvancedFilters } from '@/components/AdvancedFiltersModal';

interface Deck {
  id: string;
  title: string;
  commander: string | null;
  format: string | null;
  colors: string[] | null;
  created_at: string;
  owner_username: string;
  card_count: number;
  deck_text?: string; // For art loading
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

function BrowseDecksContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') ?? '';

  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Filters (initialize search from URL for commander hub links)
  const [search, setSearch] = useState(initialSearch);
  const [format, setFormat] = useState('all');
  const [colors, setColors] = useState('all');
  const [sort, setSort] = useState('recent');
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(defaultAdvancedFilters);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  
  // Debounce search to reduce API calls (300ms delay)
  const debouncedSearch = useDebouncedValue(search, 300);
  
  // Ref for infinite scroll observer
  const observerTarget = React.useRef<HTMLDivElement>(null);

  // Batch art for visible decks (one request instead of N) to avoid many POST /api/cards/batch-images
  const [artByDeckId, setArtByDeckId] = useState<Record<string, string>>({});
  useEffect(() => {
    if (decks.length === 0) return;
    const deckIds = decks.map((d) => d.id);
    const deckTexts: Record<string, string> = {};
    for (const d of decks) {
      if (d.deck_text) deckTexts[d.id] = d.deck_text;
    }
    let cancelled = false;
    fetch('/api/cards/batch-art-for-decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckIds, deckTexts }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.ok && j.art) setArtByDeckId(j.art);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [decks.map((d) => d.id).join(',')]);

  useEffect(() => {
    capture('browse_decks_page_view');
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
    setDecks([]);
    loadDecks(1, false);
  }, [format, colors, sort, debouncedSearch]);

  // Load more when page changes (but not on filter changes)
  useEffect(() => {
    if (page > 1) {
      loadDecks(page, true);
    }
  }, [page]);

  const loadDecks = async (pageNum: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '24',
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(format !== 'all' && { format }),
        ...(colors !== 'all' && { colors }),
        ...(sort && { sort }),
      });

      const res = await dedupFetch(`/api/decks/browse?${params}`);
      const json = await res.json();

      if (json.ok) {
        const newDecks = json.decks || [];
        
        if (append) {
          setDecks(prev => [...prev, ...newDecks]);
        } else {
          setDecks(newDecks);
        }
        
        setTotal(json.total || 0);
        setHasMore(json.hasMore || false);
        capture('browse_decks_loaded', {
          count: newDecks.length,
          page: pageNum,
          append,
          filters: { format, colors, sort, search: !!search },
        });
      }
    } catch (error) {
      console.error('Error loading decks:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Filters already trigger reload via useEffect
  };

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, loadingMore]);

  // Show/hide back to top button based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      // Show button after scrolling ~2 screens (1500px)
      setShowBackToTop(window.scrollY > 1500);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    capture('back_to_top_clicked', { page: 'browse_decks' });
  };

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-white">Browse Public Decks</h1>
          {total > 0 && (
            <div className="text-sm text-gray-400">
              Showing <span className="text-white font-semibold">{decks.length}</span> of <span className="text-white font-semibold">{total.toLocaleString()}</span> decks
            </div>
          )}
        </div>
        <p className="text-gray-400">
          Explore community decks. Find inspiration, copy strategies, and share your own!
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Advanced Filters Button */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">More Filters</label>
            <button
              onClick={() => setShowFiltersModal(true)}
              className="w-full bg-neutral-950 border border-neutral-700 hover:border-blue-500 rounded-lg px-3 py-2 text-white transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Advanced
            </button>
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
                <button onClick={() => setSearch('')} className="ml-2 hover:text-amber-200">×</button>
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
              <PrefetchLink
                key={deck.id}
                href={`/decks/${deck.id}`}
                prefetchData={[`/api/decks/${deck.id}`]}
                onClick={() => capture('browse_deck_clicked', { deck_id: deck.id })}
                className="group bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-blue-600 transition-all transform hover:scale-[1.02]"
              >
                {/* Art */}
                <div className="relative h-48 bg-neutral-950 overflow-hidden">
                  <DeckArtLoader
                    deckId={deck.id}
                    commander={deck.commander || undefined}
                    title={deck.title || undefined}
                    deckText={deck.deck_text ?? undefined}
                    initialArt={artByDeckId[deck.id]}
                    batchOnly
                  >
                    {(art, loading) => (
                      art ? (
                        <LazyImage 
                          src={art} 
                          alt={deck.title || 'Deck art'} 
                          className="w-full h-full object-cover" 
                        />
                      ) : loading ? (
                        <div className="w-full h-full flex items-center justify-center bg-neutral-900">
                          <div className="text-gray-500">Loading...</div>
                        </div>
                      ) : (
                        <DeckArtPlaceholder />
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
              </PrefetchLink>
            ))}
          </div>

          {/* Load More Button and Infinite Scroll Observer Target */}
          {hasMore && (
            <div className="flex flex-col items-center gap-4 mt-8">
              <button
                onClick={() => setPage(prev => prev + 1)}
                disabled={loadingMore}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading...
                  </span>
                ) : (
                  'Load More Decks'
                )}
              </button>
              <div 
                ref={observerTarget} 
                className="h-20 flex items-center justify-center"
              >
                {loadingMore && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <span>Loading more decks...</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* End of results message */}
          {!hasMore && decks.length > 0 && (
            <div className="mt-8 text-center text-gray-500 text-sm">
              You've reached the end! {total.toLocaleString()} decks total.
            </div>
          )}
        </>
      )}

      {/* Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 bg-blue-600 hover:bg-blue-500 text-white rounded-full p-4 shadow-lg transition-all transform hover:scale-110 z-50"
          aria-label="Back to top"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        </button>
      )}

      {/* Advanced Filters Modal */}
      <AdvancedFiltersModal
        isOpen={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
        filters={advancedFilters}
        onApply={(newFilters) => {
          setAdvancedFilters(newFilters);
          setPage(1);
          capture('advanced_filters_applied', { filters: newFilters });
          // TODO: Backend integration - send advancedFilters to API
        }}
      />
    </main>
  );
}

function BrowseDecksFallback() {
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-8">
        <div className="h-10 bg-neutral-800 rounded w-64 mb-2" />
        <div className="h-5 bg-neutral-800 rounded w-96" />
      </div>
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
    </main>
  );
}

export default function BrowseDecksPage() {
  return (
    <Suspense fallback={<BrowseDecksFallback />}>
      <BrowseDecksContent />
    </Suspense>
  );
}
