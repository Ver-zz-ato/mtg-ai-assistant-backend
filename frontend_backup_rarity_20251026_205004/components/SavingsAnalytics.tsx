"use client";
import React, { useEffect, useState } from 'react';

interface SwapStats {
  totalSaved: number;
  swapCount: number;
  avgSavingsPerSwap: number;
  bestSwap: {
    originalCard: string;
    swappedCard: string;
    savings: number;
    deckName: string;
  } | null;
  recentSwaps: Array<{
    id: string;
    deckName: string;
    originalCard: string;
    swappedCard: string;
    savings: number;
    createdAt: string;
  }>;
}

export default function SavingsAnalytics() {
  const [stats, setStats] = useState<SwapStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      setLoading(true);
      const res = await fetch('/api/analytics/savings', { cache: 'no-store' });
      const data = await res.json();
      
      if (data.ok) {
        setStats(data.stats);
      } else {
        setError(data.error || 'Failed to load analytics');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 rounded-2xl border border-green-800/30 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-green-800/30 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-green-800/30 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 rounded-2xl border border-green-800/30 p-6">
        <h3 className="text-lg font-bold text-green-400 mb-2">💰 Budget Swap Savings</h3>
        <p className="text-sm text-gray-400">Start using Budget Swaps to track your savings!</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/20 rounded-2xl border border-green-800/30 p-6">
      <h3 className="text-xl font-bold text-green-400 mb-6 flex items-center gap-2">
        <span className="text-2xl">💰</span>
        Budget Swap Savings
      </h3>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-black/30 rounded-xl p-4 border border-green-700/30">
          <div className="text-sm text-gray-400 mb-1">Total Saved</div>
          <div className="text-3xl font-bold text-green-400">${stats.totalSaved.toFixed(2)}</div>
        </div>
        
        <div className="bg-black/30 rounded-xl p-4 border border-green-700/30">
          <div className="text-sm text-gray-400 mb-1">Swaps Made</div>
          <div className="text-3xl font-bold text-green-400">{stats.swapCount}</div>
        </div>
        
        <div className="bg-black/30 rounded-xl p-4 border border-green-700/30">
          <div className="text-sm text-gray-400 mb-1">Avg per Swap</div>
          <div className="text-3xl font-bold text-green-400">${stats.avgSavingsPerSwap.toFixed(2)}</div>
        </div>
      </div>

      {/* Best Swap */}
      {stats.bestSwap && (
        <div className="bg-gradient-to-r from-yellow-900/20 to-green-900/20 rounded-xl p-4 border border-yellow-700/30 mb-6">
          <div className="text-sm text-yellow-400 font-semibold mb-2">🏆 Best Swap</div>
          <div className="text-white">
            <span className="text-red-400 line-through">{stats.bestSwap.originalCard}</span>
            {' → '}
            <span className="text-green-400 font-semibold">{stats.bestSwap.swappedCard}</span>
          </div>
          <div className="text-sm text-gray-400 mt-1">
            Saved ${stats.bestSwap.savings.toFixed(2)} in {stats.bestSwap.deckName}
          </div>
        </div>
      )}

      {/* Recent Swaps */}
      {stats.recentSwaps.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-3">Recent Swaps</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {stats.recentSwaps.map((swap) => (
              <div key={swap.id} className="bg-black/20 rounded-lg p-3 border border-gray-700/30 text-sm">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex-1">
                    <span className="text-red-400 text-xs">{swap.originalCard}</span>
                    <span className="text-gray-500 mx-1">→</span>
                    <span className="text-green-400 text-xs font-semibold">{swap.swappedCard}</span>
                  </div>
                  <span className="text-green-400 font-semibold ml-2">${swap.savings.toFixed(2)}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {swap.deckName} • {new Date(swap.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.swapCount === 0 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-400 text-sm mb-4">
            No swaps tracked yet. Use the Budget Swaps feature to start saving money!
          </p>
          <a href="/deck/swap-suggestions" className="inline-block px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors">
            Try Budget Swaps
          </a>
        </div>
      )}
    </div>
  );
}

