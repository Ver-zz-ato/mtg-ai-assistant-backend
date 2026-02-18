"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';


interface MetaData {
  topCommanders: Array<{ name: string; count: number; slug?: string }>;
  popularCards: Array<{ name: string; count: number }>;
  formatDistribution: Record<string, number>;
  totalDecks: number;
  lastUpdated: string;
}

export default function MetaDeckPanel() {
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // PERFORMANCE: Defer non-critical meta data fetch to avoid blocking initial paint
    const timeoutId = setTimeout(fetchMeta, 800);
    return () => clearTimeout(timeoutId);
  }, []);

  async function fetchMeta() {
    try {
      const res = await fetch('/api/meta/trending', { cache: 'no-store' });
      const data = await res.json();
      
      if (data.ok) {
        setMeta(data);
      }
    } catch (e) {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-2xl border border-purple-800/30 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-purple-800/30 rounded w-1/2"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-4 bg-purple-800/30 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!meta) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-2xl border border-purple-800/30 p-4 hover:border-purple-700/50 transition-all duration-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-purple-400 flex items-center gap-2">
          <span className="text-xl">📊</span>
          Meta Snapshot
        </h3>
      </div>

      {/* Total decks stat */}
      <div className="bg-black/30 rounded-lg p-3 mb-4 border border-purple-700/20">
        <div className="text-sm text-gray-400 text-center">Public Decks</div>
        <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent text-center">{meta.totalDecks.toLocaleString()}</div>
      </div>

      {/* Top Commanders - linked for SEO crawl */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">
              <Link href="/meta/trending-commanders" className="hover:text-purple-400 transition-colors">
                🏆 Top Commanders
              </Link>
            </h4>
            {meta.topCommanders && meta.topCommanders.length > 0 ? (
              <div className="space-y-1">
                {meta.topCommanders.slice(0, 5).map((cmd, i) => (
                    <Link
                      key={cmd.name}
                      href={cmd.slug ? `/commanders/${cmd.slug}` : `/decks/browse?search=${encodeURIComponent(cmd.name)}`}
                      className="flex items-center justify-between text-sm hover:bg-purple-900/20 rounded px-2 py-1 transition-colors duration-150 group"
                    >
                      <span className="text-gray-300 truncate flex-1 group-hover:text-white">
                        <span className="text-purple-400 font-semibold mr-2">{i + 1}.</span>
                        {cmd.name}
                      </span>
                      <span className="text-gray-500 text-xs ml-2">{cmd.count} decks</span>
                    </Link>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic">No commanders yet. Create public decks to see trends!</div>
            )}
          </div>

          {/* Popular Cards */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">🔥 Trending Cards</h4>
            <div className="space-y-1">
              {meta.popularCards.slice(0, 5).map((card) => (
                <div key={card.name} className="flex items-center justify-between text-sm hover:bg-purple-900/20 rounded px-2 py-1 transition-colors duration-150 cursor-default">
                  <span className="text-gray-300 truncate flex-1">{card.name}</span>
                  <span className="text-gray-500 text-xs ml-2">{card.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Meta hub link */}
          <div className="mb-4">
            <Link
              href="/meta"
              className="flex items-center gap-2 text-sm font-medium text-purple-400 hover:text-purple-300 transition-colors py-2 px-3 rounded-lg bg-purple-900/20 hover:bg-purple-900/30 border border-purple-700/30"
            >
              <span>📈</span>
              Stay Ahead of the Commander Meta
            </Link>
            <p className="text-xs text-gray-500 mt-1 px-3">Trending commanders, cards & budget builds. Updated daily.</p>
          </div>

          {/* Format Distribution */}
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">📝 Formats</h4>
            <div className="space-y-2">
              {Object.entries(meta.formatDistribution)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([format, count]) => {
                  const percentage = meta.totalDecks > 0 ? (count / meta.totalDecks * 100).toFixed(1) : 0;
                  return (
                    <div key={format} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">{format}</span>
                        <span className="text-gray-500">{percentage}%</span>
                      </div>
                      <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-600 to-blue-600 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
    </div>
  );
}

