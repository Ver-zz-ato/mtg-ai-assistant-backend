"use client";

import React from "react";

type SingletonViolationBannerProps = {
  deckId: string;
};

/**
 * Banner that checks for singleton violations in Commander decks
 * Shows cards with qty > 1, excluding legal exceptions
 */
const INITIAL_VISIBLE = 10;

export default function SingletonViolationBanner({ deckId }: SingletonViolationBannerProps) {
  const [checking, setChecking] = React.useState(true);
  const [violations, setViolations] = React.useState<Array<{ name: string; qty: number }>>([]);
  const [dismissed, setDismissed] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  // Basic lands — always allow multiple copies
  const BASIC_LANDS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest']);

  // Cards that explicitly ignore the singleton rule ("you can run as many as you like")
  const LEGAL_EXCEPTIONS = new Set([
    'Relentless Rats',
    'Rat Colony',
    'Shadowborn Apostle',
    'Persistent Petitioners',
    "Dragon's Approach",
    'Nazgûl',
  ]);

  // Check for singleton violations
  React.useEffect(() => {
    let mounted = true;
    
    async function checkSingleton() {
      try {
        setChecking(true);
        
        // Fetch deck cards
        const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: 'no-store' });
        if (res.status === 401 || res.status === 403) {
          if (mounted) {
            setViolations([]);
            setChecking(false);
          }
          return;
        }
        
        const data = await res.json().catch(() => ({ ok: false }));
        if (!mounted || !data?.ok) {
          if (mounted) {
            setViolations([]);
            setChecking(false);
          }
          return;
        }

        const cards = Array.isArray(data.cards) ? data.cards : [];
        const violationsList: Array<{ name: string; qty: number }> = [];
        
        for (const card of cards) {
          const cardName = String(card.name || '').trim();
          const cardNameLower = cardName.toLowerCase();
          const qty = Number(card.qty || 0);
          
          if (qty <= 1) continue;
          if (BASIC_LANDS.has(cardNameLower)) continue; // basic lands OK
          if (LEGAL_EXCEPTIONS.has(cardName)) continue; // explicit "run as many as you like" cards
          
          violationsList.push({ name: cardName, qty });
        }
        
        if (mounted) {
          setViolations(violationsList);
        }
      } catch (error) {
        if (!mounted) return;
        console.error('[SingletonViolationBanner] Check failed:', error);
        setViolations([]);
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    // Small delay to avoid blocking initial render
    const timeoutId = setTimeout(checkSingleton, 500);
    
    // Listen for deck changes to re-check
    const handleChange = () => {
      if (mounted) {
        setDismissed(false);
        checkSingleton();
      }
    };
    window.addEventListener('deck:changed', handleChange);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      window.removeEventListener('deck:changed', handleChange);
    };
  }, [deckId]);

  // Don't show if checking, dismissed, or no violations
  if (checking || dismissed || violations.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-orange-500/50 bg-gradient-to-r from-orange-900/40 to-red-900/40 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="text-2xl flex-shrink-0">🔄</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-orange-300 mb-1">
              Singleton Rule Violation
            </div>
            <div className="text-sm text-orange-200/80 mb-2">
              This Commander deck has <strong>{violations.length} card{violations.length !== 1 ? 's' : ''}</strong> with multiple copies. Commander is a singleton format (one copy per card, except for basic lands and legal exceptions).
            </div>
            <div className={`text-xs text-orange-200/70 font-mono overflow-y-auto ${expanded ? 'max-h-64' : 'max-h-32'}`}>
              {(expanded ? violations : violations.slice(0, INITIAL_VISIBLE)).map(v => (
                <div key={v.name} className="truncate">• {v.name} ({v.qty}x)</div>
              ))}
              {violations.length > INITIAL_VISIBLE && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="mt-1 text-orange-300/80 hover:text-orange-200 font-medium underline underline-offset-1 focus:outline-none focus:ring-1 focus:ring-orange-400 rounded"
                >
                  {expanded
                    ? 'Show less'
                    : `... and ${violations.length - INITIAL_VISIBLE} more`}
                </button>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="px-3 py-2 rounded-lg border border-orange-500/50 hover:bg-orange-900/30 text-orange-300 text-sm font-medium transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
