
'use client';
import React, { useEffect, useState } from 'react';
import { listThreads } from '@/lib/threads';
import type { ThreadSummary as ThreadMeta } from '@/types/chat';

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
  'data-testid'?: string;
};

export default function HistoryDropdown(props: Props) {
  const { value, onChange } = props;

  // Local threads state; component is responsible for fetching
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ messageId: string; threadId: string; threadTitle: string; role: string; content: string; snippet: string; createdAt: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // fetch threads on mount and whenever parent forces a re-key (Chat passes key={histKey})
  useEffect(() => {
    let aborted = false;
    const ac = new AbortController();
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await listThreads(ac.signal);
        const items = (res?.threads ?? []) as ThreadMeta[];
        if (!aborted) setThreads(Array.isArray(items) ? items : []);
      } catch (e: any) {
        if (!aborted) setError(e?.message || 'Failed to load threads');
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => { aborted = true; try { ac.abort(); } catch {} };
  }, []); // relies on parent re-mounting with key to refresh

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    let aborted = false;
    const ac = new AbortController();
    const timeoutId = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/chat/search?q=${encodeURIComponent(searchQuery)}&limit=10`, {
          signal: ac.signal,
          cache: 'no-store'
        });
        const json = await res.json();
        if (!aborted && json?.ok) {
          setSearchResults(json.results || []);
        }
      } catch (e: any) {
        if (!aborted && e.name !== 'AbortError') {
          setSearchResults([]);
        }
      } finally {
        if (!aborted) setSearchLoading(false);
      }
    }, 300); // Debounce 300ms

    return () => {
      aborted = true;
      clearTimeout(timeoutId);
      ac.abort();
    };
  }, [searchQuery]);

  const selectValue = value ?? '';

  return (
    <div className="relative" data-testid={props['data-testid']}>
      <div className="flex items-center gap-2">
        <select
          className="w-[12rem] rounded-md border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          value={selectValue}
          onChange={(e) => onChange(e.target.value || null)}
          style={{ position: 'relative', zIndex: 1000 }}
        >
          <option value="">{loading ? 'Loading…' : 'New thread'}</option>
          {threads?.map((t) => (
            <option key={t.id} value={t.id}>{t.title ?? t.id}</option>
          ))}
        </select>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="px-2 py-1 rounded-md border border-zinc-600 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 text-sm transition-colors"
          title="Search conversation history"
        >
          🔍
        </button>
      </div>

      {/* Search modal */}
      {showSearch && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowSearch(false)}>
          <div className="max-w-2xl w-full rounded-xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🔍</span>
              <h3 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                Search Conversation History
              </h3>
              <button
                onClick={() => setShowSearch(false)}
                className="ml-auto px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800 text-sm"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for cards, topics, or keywords..."
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <div className="text-xs text-neutral-400 mt-1">
                {searchQuery.length < 2 ? 'Enter at least 2 characters to search' : searchLoading ? 'Searching...' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
              </div>
            </div>

            {searchQuery.length >= 2 && (
              <div className="max-h-[60vh] overflow-y-auto space-y-2">
                {searchLoading ? (
                  <div className="text-center py-8 text-neutral-400">Searching...</div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400">No results found</div>
                ) : (
                  searchResults.map((result) => (
                    <button
                      key={result.messageId}
                      onClick={() => {
                        onChange(result.threadId);
                        setShowSearch(false);
                        setSearchQuery('');
                        // Scroll to message would require additional implementation
                      }}
                      className="w-full text-left p-3 rounded-lg border border-neutral-700 hover:bg-neutral-800 hover:border-blue-500 transition-all"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-blue-400">{result.threadTitle}</span>
                        <span className="text-xs text-neutral-500">{new Date(result.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-xs text-neutral-300 whitespace-pre-wrap line-clamp-3">
                        {result.snippet}
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        {result.role === 'user' ? 'You' : 'Assistant'}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
