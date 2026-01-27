"use client";

import React from "react";

type FormatCardCountBannerProps = {
  deckId: string;
  format?: string;
};

/**
 * Banner that checks for incorrect card counts based on format
 * Commander: exactly 100 cards (excluding commander)
 * Standard/Modern/Pioneer/Pauper: exactly 60 cards
 */
export default function FormatCardCountBanner({ deckId, format }: FormatCardCountBannerProps) {
  const [checking, setChecking] = React.useState(true);
  const [cardCount, setCardCount] = React.useState<number | null>(null);
  const [violation, setViolation] = React.useState<{ type: 'too_many' | 'too_few' | null; expected: number; actual: number } | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  const formatLower = format?.toLowerCase() || '';
  const shouldCheck = formatLower && ['commander', 'standard', 'modern', 'pioneer', 'pauper'].includes(formatLower);

  // Determine expected count based on format
  const expectedCount = formatLower === 'commander' ? 100 : 60;

  // Check card count
  React.useEffect(() => {
    if (!shouldCheck) {
      setChecking(false);
      return;
    }

    let mounted = true;
    
    async function checkCardCount() {
      try {
        setChecking(true);
        
        // Fetch deck cards
        const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: 'no-store' });
        if (res.status === 401 || res.status === 403) {
          if (mounted) {
            setCardCount(null);
            setViolation(null);
            setChecking(false);
          }
          return;
        }
        
        const data = await res.json().catch(() => ({ ok: false }));
        if (!mounted || !data?.ok) {
          if (mounted) {
            setCardCount(null);
            setViolation(null);
            setChecking(false);
          }
          return;
        }

        const cards = Array.isArray(data.cards) ? data.cards : [];
        const totalCount = cards.reduce((sum: number, card: any) => sum + (card.qty || 0), 0);
        
        if (mounted) {
          setCardCount(totalCount);
          
          // Check for violations
          if (totalCount < expectedCount) {
            setViolation({ type: 'too_few', expected: expectedCount, actual: totalCount });
          } else if (totalCount > expectedCount) {
            setViolation({ type: 'too_many', expected: expectedCount, actual: totalCount });
          } else {
            setViolation(null);
          }
        }
      } catch (error) {
        if (!mounted) return;
        console.error('[FormatCardCountBanner] Check failed:', error);
        setCardCount(null);
        setViolation(null);
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    // Small delay to avoid blocking initial render
    const timeoutId = setTimeout(checkCardCount, 500);
    
    // Listen for deck changes to re-check
    const handleChange = () => {
      if (mounted) {
        setDismissed(false);
        checkCardCount();
      }
    };
    window.addEventListener('deck:changed', handleChange);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      window.removeEventListener('deck:changed', handleChange);
    };
  }, [deckId, formatLower, shouldCheck, expectedCount]);

  // Don't show if checking, dismissed, or no violation
  if (!shouldCheck || checking || dismissed || !violation || cardCount === null) {
    return null;
  }

  const formatName = formatLower.charAt(0).toUpperCase() + formatLower.slice(1);
  const isTooFew = violation.type === 'too_few';
  const difference = Math.abs(violation.actual - violation.expected);

  return (
    <div className="mb-4 rounded-lg border border-yellow-500/50 bg-gradient-to-r from-yellow-900/40 to-orange-900/40 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="text-2xl flex-shrink-0">⚠️</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-yellow-300 mb-1">
              {isTooFew ? 'Insufficient Cards' : 'Too Many Cards'}
            </div>
            <div className="text-sm text-yellow-200/80 mb-2">
              This {formatName} deck has <strong>{violation.actual} card{violation.actual !== 1 ? 's' : ''}</strong>, but {formatName} requires exactly <strong>{violation.expected} cards</strong>.
              {isTooFew ? (
                <span> Add <strong>{difference} more card{difference !== 1 ? 's' : ''}</strong> to meet the format requirement.</span>
              ) : (
                <span> Remove <strong>{difference} card{difference !== 1 ? 's' : ''}</strong> to meet the format requirement.</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="px-3 py-2 rounded-lg border border-yellow-500/50 hover:bg-yellow-900/30 text-yellow-300 text-sm font-medium transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
