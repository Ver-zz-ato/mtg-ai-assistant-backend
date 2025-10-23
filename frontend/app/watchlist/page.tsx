"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { capture } from "@/lib/ph";
import { usePrefs } from "@/components/PrefsContext";
import CardAutocomplete from "@/components/CardAutocomplete";
import GuestLandingPage from "@/components/GuestLandingPage";
import { useProStatus } from "@/hooks/useProStatus";

export default function WatchlistPage() {
  const { user, loading: authLoading } = useAuth();
  const { isPro } = useProStatus();

  useEffect(() => {
    if (user) {
      try {
        capture('watchlist_page_view');
      } catch {}
    }
  }, [user]);

  if (!user) {
    const features = [
      {
        icon: '📊',
        title: 'Price Monitoring',
        description: 'Track real-time prices for your target cards and spot market trends early.',
        highlight: true,
      },
      {
        icon: '📈',
        title: 'Price Deltas',
        description: 'See 24h, 7d, and 30d price changes at a glance with color-coded indicators.',
      },
      {
        icon: '🎯',
        title: 'Target Prices',
        description: 'Set target prices and get notified when cards drop to your buying range.',
      },
      {
        icon: '⚡',
        title: 'Quick Add',
        description: 'Instantly add cards from Price Tracker, search results, or deck analysis.',
      },
      {
        icon: '💎',
        title: 'Pro Feature',
        description: 'Track unlimited cards with historical data and price alerts.',
        highlight: true,
      },
    ];

    const demoSection = (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Smart Price Tracking
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-3 text-gray-600 dark:text-gray-400">Card</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-400">Price</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-400">24h</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-400">7d</th>
                <th className="text-right p-3 text-gray-600 dark:text-gray-400">30d</th>
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-white">
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="p-3">The One Ring</td>
                <td className="text-right p-3 font-mono">$89.50</td>
                <td className="text-right p-3 text-red-600">-5.2%</td>
                <td className="text-right p-3 text-red-600">-12.1%</td>
                <td className="text-right p-3 text-green-600">+8.3%</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="p-3">Force of Will</td>
                <td className="text-right p-3 font-mono">$125.00</td>
                <td className="text-right p-3 text-green-600">+2.1%</td>
                <td className="text-right p-3 text-green-600">+5.7%</td>
                <td className="text-right p-3 text-green-600">+15.2%</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="p-3">Mana Crypt</td>
                <td className="text-right p-3 font-mono">$165.75</td>
                <td className="text-right p-3 text-gray-500">-0.1%</td>
                <td className="text-right p-3 text-red-600">-3.2%</td>
                <td className="text-right p-3 text-gray-500">+1.5%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
          Track price movements and catch the best buying opportunities
        </div>
      </div>
    );

    return (
      <GuestLandingPage
        title="Price Watchlist"
        subtitle="Track card prices with real-time alerts and historical data"
        features={features}
        demoSection={demoSection}
      />
    );
  }

  if (!isPro) {
    return (
      <main className="mx-auto max-w-4xl p-6 space-y-6">
        <div className="rounded-xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-amber-900/10 p-8 text-center">
          <div className="text-6xl mb-4">💎</div>
          <h2 className="text-2xl font-bold mb-3">Price Watchlist is a Pro Feature</h2>
          <p className="text-lg opacity-80 mb-6">
            Track card prices, set alerts, and never miss a buying opportunity
          </p>
          <a
            href="/pricing"
            className="inline-block px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-semibold rounded-lg transition-all shadow-lg"
          >
            Upgrade to Pro
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Price Watchlist</h1>
        <div className="flex items-center gap-2">
          <div className="text-xs px-2 py-1 rounded bg-amber-500 text-black font-bold">PRO</div>
        </div>
      </div>
      
      <WatchlistEditor />
    </main>
  );
}

function WatchlistEditor() {
  const { currency: globalCurrency } = usePrefs();
  const currency = (globalCurrency as 'USD'|'EUR'|'GBP') || 'USD';
  
  const [items, setItems] = useState<Array<{
    id: string;
    name: string;
    target_price: number | null;
    created_at: string;
  }>>([]);
  const [prices, setPrices] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadWatchlist = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/watchlist/list', { cache: 'no-store' });
      const data = await res.json();
      
      if (data.ok && data.watchlist?.items) {
        setItems(data.watchlist.items);
        
        // Load prices for all items
        if (data.watchlist.items.length > 0) {
          const names = data.watchlist.items.map((item: any) => item.name);
          await loadPrices(names);
        }
      } else {
        setError(data.error || 'Failed to load watchlist');
      }
    } catch (e: any) {
      console.error('Load error:', e);
      setError(e?.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  const loadPrices = async (names: string[]) => {
    try {
      const priceMap = new Map();
      
      for (const name of names) {
        try {
          const res = await fetch(`/api/price?name=${encodeURIComponent(name)}&currency=${currency}`, {
            cache: 'no-store'
          });
          const data = await res.json();
          
          if (data.ok) {
            priceMap.set(name, {
              current: data.price || 0,
              delta_24h: data.delta_24h || 0,
              delta_7d: data.delta_7d || 0,
              delta_30d: data.delta_30d || 0,
            });
          }
        } catch (e) {
          console.error(`Failed to load price for ${name}:`, e);
        }
      }
      
      setPrices(priceMap);
    } catch (e) {
      console.error('Price load error:', e);
    }
  };

  const addCard = async () => {
    if (!addName.trim()) return;
    
    try {
      setAdding(true);
      setError(null);
      
      const res = await fetch('/api/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName.trim(),
          target_price: targetPrice ? parseFloat(targetPrice) : null
        })
      });
      
      const data = await res.json();
      
      if (data.ok) {
        setAddName('');
        setTargetPrice('');
        await loadWatchlist();
      } else {
        setError(data.error || 'Failed to add card');
      }
    } catch (e: any) {
      console.error('Add error:', e);
      setError(e?.message || 'Add failed');
    } finally {
      setAdding(false);
    }
  };

  const removeCard = async (id: string) => {
    try {
      const res = await fetch('/api/watchlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      
      const data = await res.json();
      
      if (data.ok) {
        await loadWatchlist();
      } else {
        setError(data.error || 'Failed to remove card');
      }
    } catch (e: any) {
      console.error('Remove error:', e);
      setError(e?.message || 'Remove failed');
    }
  };

  useEffect(() => {
    loadWatchlist();
  }, [currency]);

  const formatPrice = (p: number) => {
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
    return `${sym}${p.toFixed(2)}`;
  };

  const formatDelta = (delta: number) => {
    if (delta === 0) return <span className="text-gray-500">0%</span>;
    const sign = delta > 0 ? '+' : '';
    const color = delta > 0 ? 'text-green-500' : 'text-red-500';
    return <span className={color}>{sign}{delta.toFixed(1)}%</span>;
  };

  if (loading && items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-neutral-800/50 rounded-xl animate-pulse" />
        <div className="h-96 bg-neutral-800/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Card Section */}
      <div className="rounded-xl border border-neutral-800 p-6 bg-neutral-900/50">
        <h3 className="font-semibold mb-4">Add Card to Watchlist</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm opacity-70 mb-1 block">Card Name</label>
            <CardAutocomplete
              value={addName}
              onChange={setAddName}
              onPick={setAddName}
            />
          </div>
          <div>
            <label className="text-sm opacity-70 mb-1 block">Target Price (Optional)</label>
            <input
              type="number"
              step="0.01"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="e.g. 25.00"
              className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={addCard}
            disabled={adding || !addName.trim()}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {adding ? 'Adding...' : 'Add to Watchlist'}
          </button>
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </div>

      {/* Watchlist Table */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 p-12 text-center">
          <div className="text-5xl mb-4">👀</div>
          <h3 className="text-xl font-semibold mb-2">No cards in watchlist</h3>
          <p className="text-sm opacity-70">
            Add cards above to start tracking their prices and market movements
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-neutral-800/50 text-sm">
                  <th className="text-left p-4">Card</th>
                  <th className="text-right p-4">Current Price</th>
                  <th className="text-right p-4">Target</th>
                  <th className="text-right p-4">24h</th>
                  <th className="text-right p-4">7d</th>
                  <th className="text-right p-4">30d</th>
                  <th className="text-right p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {items.map((item) => {
                  const priceData = prices.get(item.name);
                  const current = priceData?.current || 0;
                  const targetHit = item.target_price && current > 0 && current <= item.target_price;

                  return (
                    <tr key={item.id} className={`hover:bg-neutral-800/30 ${targetHit ? 'bg-green-900/10' : ''}`}>
                      <td className="p-4">
                        <div className="font-medium">{item.name}</div>
                        {targetHit && (
                          <div className="text-xs text-green-500 mt-1">🎯 Target price hit!</div>
                        )}
                      </td>
                      <td className="text-right p-4 font-mono">
                        {priceData ? formatPrice(current) : '—'}
                      </td>
                      <td className="text-right p-4 font-mono text-sm opacity-70">
                        {item.target_price ? formatPrice(item.target_price) : '—'}
                      </td>
                      <td className="text-right p-4">
                        {priceData ? formatDelta(priceData.delta_24h) : '—'}
                      </td>
                      <td className="text-right p-4">
                        {priceData ? formatDelta(priceData.delta_7d) : '—'}
                      </td>
                      <td className="text-right p-4">
                        {priceData ? formatDelta(priceData.delta_30d) : '—'}
                      </td>
                      <td className="text-right p-4">
                        <button
                          onClick={() => removeCard(item.id)}
                          className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-red-600/20 hover:border-red-600 transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

