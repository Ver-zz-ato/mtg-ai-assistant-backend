"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { capture } from "@/lib/ph";
import { usePrefs } from "@/components/PrefsContext";
import CardAutocomplete from "@/components/CardAutocomplete";
import GuestLandingPage from "@/components/GuestLandingPage";
import { useProStatus } from "@/hooks/useProStatus";
import { getImagesForNames } from "@/lib/scryfall";

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
  const [images, setImages] = useState<Record<string, { small?: string; normal?: string }>>({});
  const [previewCard, setPreviewCard] = useState<{ src: string; x: number; y: number } | null>(null);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [bulkValidationItems, setBulkValidationItems] = React.useState<Array<{ originalName: string; suggestions: string[]; choice?: string; qty: number }>>([]);
  const [showBulkValidation, setShowBulkValidation] = React.useState(false);
  const [pendingTargetPrice, setPendingTargetPrice] = React.useState<number | null>(null);

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

  const addCard = async (cardName?: string) => {
    const name = (cardName || addName).trim();
    if (!name) return;
    
    try {
      setAdding(true);
      setError(null);
      
      // Validate card name before adding (similar to wishlist/collections)
      try {
        const validationRes = await fetch('/api/cards/fuzzy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: [name] })
        });
        const validationJson = await validationRes.json().catch(() => ({}));
        const fuzzyResults = validationJson?.results || {};
        
        const suggestion = fuzzyResults[name]?.suggestion;
        const allSuggestions = Array.isArray(fuzzyResults[name]?.all) ? fuzzyResults[name].all : [];
        
        // If name needs fixing, show validation modal
        if (suggestion && suggestion !== name && allSuggestions.length > 0) {
          setBulkValidationItems([{
            originalName: name,
            suggestions: allSuggestions,
            choice: allSuggestions[0] || suggestion,
            qty: 1
          }]);
          setShowBulkValidation(true);
          setPendingTargetPrice(targetPrice ? parseFloat(targetPrice) : null);
          setAdding(false);
          return;
        }
      } catch (validationError) {
        console.warn('Validation check failed, proceeding anyway:', validationError);
        // Continue with adding if validation fails (fallback)
      }
      
      const res = await fetch('/api/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
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
    // INSTANT UPDATE: Remove from UI immediately (optimistic)
    const cardToRemove = items.find(i => i.id === id);
    if (!cardToRemove) return;
    
    const previousItems = items;
    setItems(prev => prev.filter(i => i.id !== id));
    
    // Use undo toast with 8 second window
    const { undoToastManager } = await import('@/lib/undo-toast');
    
    undoToastManager.showUndo({
      id: `remove-watchlist-${id}`,
      message: `Removed ${cardToRemove.name} from watchlist`,
      duration: 8000,
      onUndo: async () => {
        // Restore card to UI immediately
        setItems(previousItems);
      },
      onExecute: async () => {
        // Actually delete from database (only runs if undo not clicked within 8 seconds)
        try {
          const res = await fetch('/api/watchlist/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
          });
          
          const data = await res.json();
          
          if (!data.ok) {
            // If delete fails, restore the card
            setItems(previousItems);
            setError(data.error || 'Failed to remove card');
          }
        } catch (e: any) {
          console.error('Remove error:', e);
          setError(e?.message || 'Remove failed');
          // Restore on error
          setItems(previousItems);
        }
      },
    });
  };

  const updateTargetPrice = async (id: string, newTarget: number | null) => {
    try {
      const res = await fetch('/api/watchlist/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, target_price: newTarget })
      });
      
      const data = await res.json();
      
      if (data.ok) {
        // Update local state
        setItems(prev => prev.map(item => 
          item.id === id ? { ...item, target_price: newTarget } : item
        ));
        setEditingTarget(null);
      } else {
        setError(data.error || 'Failed to update target');
      }
    } catch (e: any) {
      console.error('Update error:', e);
      setError(e?.message || 'Update failed');
    }
  };

  const handleMouseEnter = (e: React.MouseEvent, card: string) => {
    const img = images[card.toLowerCase()]?.normal;
    if (!img) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPreviewCard({ src: img, x: rect.right + 10, y: rect.top });
  };

  const handleMouseLeave = () => {
    setPreviewCard(null);
  };

  useEffect(() => {
    loadWatchlist();
  }, [currency]);

  // Load card images
  useEffect(() => {
    if (items.length === 0) return;
    (async () => {
      try {
        const names = items.map(i => i.name);
        const imgsMap = await getImagesForNames(names);
        const imgsRecord: Record<string, { small?: string; normal?: string }> = {};
        imgsMap.forEach((value, key) => {
          imgsRecord[key] = value;
        });
        setImages(imgsRecord);
      } catch (e) {
        console.error('Failed to load images:', e);
      }
    })();
  }, [items]);

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

  // Calculate alert summary - use items length as dependency proxy for prices Map
  // (prices Map changes reference but we access by item.name, so we use items as the dependency)
  const alertSummary = useMemo(() => {
    let droppedToday = 0;
    let hitTarget = 0;
    let nearTarget = 0;
    
    items.forEach((item) => {
      const priceData = prices.get(item.name);
      const current = priceData?.current || 0;
      const delta24h = priceData?.delta_24h || 0;
      
      if (delta24h < -2) droppedToday++;
      if (item.target_price && current > 0 && current <= item.target_price) hitTarget++;
      if (item.target_price && current > 0 && ((current / item.target_price) <= 1.1 && (current / item.target_price) >= 0.9) && current > item.target_price) nearTarget++;
    });
    
    return { droppedToday, hitTarget, nearTarget };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, prices.size]); // Use prices.size as a stable dependency instead of the Map itself

  return (
    <div className="space-y-6">
      {/* Alert Summary Panel */}
      {items.length > 0 && (alertSummary.droppedToday > 0 || alertSummary.hitTarget > 0 || alertSummary.nearTarget > 0) && (
        <div className="rounded-xl border border-neutral-800 p-4 bg-gradient-to-r from-blue-950/30 via-purple-950/20 to-blue-950/30">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse"></div>
            <h3 className="font-semibold text-sm">Watchlist Alerts</h3>
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            {alertSummary.droppedToday > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-red-400">▼</span>
                <span><strong>{alertSummary.droppedToday}</strong> card{alertSummary.droppedToday !== 1 ? 's' : ''} dropped today</span>
              </div>
            )}
            {alertSummary.hitTarget > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-green-400">🎯</span>
                <span><strong>{alertSummary.hitTarget}</strong> card{alertSummary.hitTarget !== 1 ? 's' : ''} hit your target price!</span>
              </div>
            )}
            {alertSummary.nearTarget > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-amber-400">⚡</span>
                <span><strong>{alertSummary.nearTarget}</strong> card{alertSummary.nearTarget !== 1 ? 's' : ''} near target price</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Add Card Section */}
      <div className="rounded-xl border border-neutral-800 p-6 bg-neutral-900/50">
        <h3 className="font-semibold mb-4">Add Card to Watchlist</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm opacity-70 mb-1 block">Card Name</label>
            <CardAutocomplete
              value={addName}
              onChange={setAddName}
              onPick={(name)=>{ setAddName(name); setTimeout(() => addCard(name), 0); }}
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
            onClick={() => addCard()}
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

                  const cardImg = images[item.name.toLowerCase()];
                  
                  // Calculate visual states
                  const delta7d = priceData?.delta_7d || 0;
                  const delta30d = priceData?.delta_30d || 0;
                  const nearTarget = item.target_price && current > 0 && current > 0 && ((current / item.target_price) <= 1.1 && (current / item.target_price) >= 0.9); // Within 10%
                  
                  // Determine row state color based on 7d or 30d trend (prioritize 7d if available)
                  const trendDelta = delta7d !== 0 ? delta7d : delta30d;
                  const isRising = trendDelta > 2; // > 2% increase
                  const isFalling = trendDelta < -2; // > 2% decrease
                  const isNearTarget = nearTarget && !targetHit;
                  
                  // Row background styling based on state
                  let rowBgClass = 'bg-white/[0.02] hover:bg-white/[0.04] transition-colors group';
                  if (targetHit) rowBgClass = 'bg-green-900/20 border-l-2 border-l-green-500/50';
                  else if (isNearTarget) rowBgClass = 'bg-amber-900/10 border-l-2 border-l-amber-500/40';
                  else if (isRising) rowBgClass = 'bg-green-900/10 border-l-2 border-l-green-500/30';
                  else if (isFalling) rowBgClass = 'bg-red-900/10 border-l-2 border-l-red-500/30';
                  
                  // Calculate % to target
                  const percentToTarget = item.target_price && current > 0 
                    ? ((current / item.target_price) * 100).toFixed(1)
                    : null;
                  
                  return (
                    <tr key={item.id} className={`${rowBgClass}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {cardImg?.small && (
                            <img 
                              src={cardImg.small} 
                              alt={item.name}
                              className="w-12 h-16 rounded object-cover cursor-pointer border border-neutral-800"
                              onMouseEnter={(e) => handleMouseEnter(e, item.name)}
                              onMouseLeave={handleMouseLeave}
                            />
                          )}
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {targetHit && (
                              <div className="text-xs text-green-500 mt-1">🎯 Target price hit!</div>
                            )}
                            {isNearTarget && !targetHit && (
                              <div className="text-xs text-amber-500 mt-1">Near target ({percentToTarget}%)</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-right p-4 font-mono">
                        {priceData ? formatPrice(current) : '—'}
                      </td>
                      <td className="text-right p-4 text-sm">
                        {editingTarget === item.id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-20 bg-neutral-950 border border-neutral-600 rounded px-2 py-1 text-right text-xs"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  updateTargetPrice(item.id, editValue ? parseFloat(editValue) : null);
                                } else if (e.key === 'Escape') {
                                  setEditingTarget(null);
                                }
                              }}
                              autoFocus
                            />
                            <button
                              onClick={() => updateTargetPrice(item.id, editValue ? parseFloat(editValue) : null)}
                              className="text-green-500 hover:text-green-400 text-xs px-1"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditingTarget(null)}
                              className="text-red-500 hover:text-red-400 text-xs px-1"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <div
                              className="font-mono opacity-80 cursor-pointer hover:opacity-100 hover:text-blue-400 underline underline-offset-2 decoration-dotted"
                              onClick={() => {
                                setEditingTarget(item.id);
                                setEditValue(item.target_price ? item.target_price.toString() : '');
                              }}
                            >
                              {item.target_price ? formatPrice(item.target_price) : <span className="opacity-50 text-xs">Set target</span>}
                            </div>
                            {item.target_price && priceData && current > 0 && (
                              <div className="text-[10px] opacity-60">
                                {percentToTarget}% • {current <= item.target_price ? 'Hit!' : `Need ${formatPrice(item.target_price - current)} drop`}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="text-right p-4">
                        {priceData ? (
                          <div className="flex items-center justify-end gap-1">
                            {priceData.delta_24h > 0 && <span className="text-green-500">▲</span>}
                            {priceData.delta_24h < 0 && <span className="text-red-500">▼</span>}
                            {formatDelta(priceData.delta_24h)}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="text-right p-4">
                        {priceData ? (
                          <div className="flex items-center justify-end gap-1">
                            {priceData.delta_7d > 0 && <span className="text-green-500">▲</span>}
                            {priceData.delta_7d < 0 && <span className="text-red-500">▼</span>}
                            {formatDelta(priceData.delta_7d)}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="text-right p-4">
                        {priceData ? (
                          <div className="flex items-center justify-end gap-1">
                            {priceData.delta_30d > 0 && <span className="text-green-500">▲</span>}
                            {priceData.delta_30d < 0 && <span className="text-red-500">▼</span>}
                            {formatDelta(priceData.delta_30d)}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="text-right p-4">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/wishlists/add', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ names: [item.name] })
                                });
                                const data = await res.json();
                                if (data.ok) {
                                  window.dispatchEvent(new CustomEvent('toast', { detail: `Moved ${item.name} to wishlist` }));
                                  // Optionally remove from watchlist after moving
                                  // await removeCard(item.id);
                                } else {
                                  setError(data.error || 'Failed to move to wishlist');
                                }
                              } catch (e: any) {
                                setError(e?.message || 'Failed to move to wishlist');
                              }
                            }}
                            className="px-2 py-1 text-xs rounded bg-neutral-800/60 hover:bg-blue-600/80 text-neutral-400 hover:text-white transition-all border border-neutral-700/50 hover:border-blue-500/50"
                            title="Move to wishlist"
                          >
                            📋 Wishlist
                          </button>
                          <button
                            onClick={() => removeCard(item.id)}
                            className="px-2 py-1 text-xs rounded bg-neutral-800/60 hover:bg-red-600/80 text-neutral-400 hover:text-white transition-all border border-neutral-700/50 hover:border-red-500/50"
                            title="Remove from watchlist"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hover Preview */}
      {previewCard && (
        <div
          className="fixed pointer-events-none z-50"
          style={{ left: previewCard.x, top: previewCard.y }}
        >
          <img
            src={previewCard.src}
            alt="Card preview"
            className="w-64 rounded-lg shadow-2xl border-2 border-neutral-700"
          />
        </div>
      )}
      
      {/* Bulk validation modal - for fixing names before adding */}
      {showBulkValidation && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => { setShowBulkValidation(false); setBulkValidationItems([]); }}>
          <div className="max-w-xl w-full rounded-xl border border-orange-700 bg-neutral-900 p-5 text-sm shadow-2xl" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">✏️</span>
              <h3 className="text-lg font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
                Fix Card Name Before Adding
              </h3>
            </div>
            <div className="mb-3 text-xs text-neutral-400">
              Found a card that needs fixing. Select the correct name from the dropdown:
            </div>
            <div className="space-y-2 mb-4">
              {bulkValidationItems.map((it, idx) => (
                <div key={`${it.originalName}-${idx}`} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600 transition-colors">
                  <div className="flex-1">
                    <div className="font-medium text-neutral-200 truncate">{it.originalName}</div>
                  </div>
                  <svg className="w-4 h-4 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <select value={it.choice} onChange={e=>setBulkValidationItems(arr => { const next = arr.slice(); next[idx] = { ...it, choice: e.target.value }; return next; })}
                    className="bg-neutral-950 border border-neutral-600 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent min-w-[180px]">
                    {it.suggestions.map(s => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => { setShowBulkValidation(false); setBulkValidationItems([]); setPendingTargetPrice(null); }} className="px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm font-medium transition-colors">
                Cancel
              </button>
              <button onClick={async()=>{
                try {
                  const correctedName = bulkValidationItems[0]?.choice || bulkValidationItems[0]?.originalName;
                  if (!correctedName) return;
                  
                  const res = await fetch('/api/watchlist/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name: correctedName,
                      target_price: pendingTargetPrice
                    })
                  });
                  
                  const data = await res.json();
                  
                  if (data.ok) {
                    setShowBulkValidation(false);
                    setBulkValidationItems([]);
                    setPendingTargetPrice(null);
                    setAddName('');
                    setTargetPrice('');
                    await loadWatchlist();
                  } else {
                    setError(data.error || 'Failed to add card');
                  }
                } catch(e:any) {
                  alert(e?.message||'Failed to add card');
                }
              }} className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg">
                Apply Fixed Name & Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

