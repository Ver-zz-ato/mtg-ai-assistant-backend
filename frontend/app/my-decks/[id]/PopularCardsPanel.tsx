"use client";
import React from "react";

export default function PopularCardsPanel({ commander, deckId, onAddCard }: { commander: string | null; deckId: string; onAddCard: (name: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [popularCards, setPopularCards] = React.useState<Array<{ card: string; inclusion_rate: string; deck_count: number }>>([]);

  // Listen for hide/show all panels event
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show;
        if (shouldShow !== undefined) {
          setOpen(shouldShow);
        }
      }
    };
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    return () => window.removeEventListener('side-panels-toggle' as any, handler as EventListener);
  }, []);

  // Fetch popular cards when opened and commander is present
  React.useEffect(() => {
    if (!open || !commander) {
      if (!open) {
        // Reset when closed to allow re-fetch on next open
        setPopularCards([]);
        setError(null);
      }
      return;
    }
    
    // Only fetch if not already loaded
    if (popularCards.length > 0 || loading) return;
    
    // Type guard: assign to const to narrow type from string | null to string
    const commanderName: string = commander;
    
    async function loadPopularCards() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/deck/popular-cards?commander=${encodeURIComponent(commanderName)}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({ ok: false }));
        
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || 'Failed to load popular cards');
        }
        
        setPopularCards(Array.isArray(data.cards) ? data.cards : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to load popular cards');
        setPopularCards([]);
      } finally {
        setLoading(false);
      }
    }
    
    loadPopularCards();
  }, [open, commander]);

  // Don't show if no commander
  if (!commander) {
    return null;
  }

  return (
    <section className="rounded-xl border border-neutral-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-blue-400 animate-pulse shadow-lg shadow-blue-400/50"></div>
          <h3 className="text-sm font-bold bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">
            Popular for this Commander
          </h3>
        </div>
        <button onClick={() => setOpen(v => !v)} className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs transition-colors">
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-8 bg-neutral-800 rounded"></div>
              ))}
            </div>
          ) : error ? (
            <div className="text-xs text-red-400">{error}</div>
          ) : popularCards.length === 0 ? (
            <div className="text-xs text-neutral-400">No popular cards data available yet.</div>
          ) : (
            <ul className="space-y-1 max-h-[400px] overflow-y-auto">
              {popularCards.map((item, i) => (
                <li key={`${item.card}-${i}`} className="flex items-center justify-between gap-2 py-1">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm truncate block">{item.card}</span>
                    <span className="text-[10px] opacity-70">{item.inclusion_rate}</span>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await onAddCard(item.card);
                      } catch (e: any) {
                        alert(e?.message || 'Failed to add card');
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-[10px] whitespace-nowrap transition-colors"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
