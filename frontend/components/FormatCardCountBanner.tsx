"use client";

import React from "react";
import FinishDeckPanel from "@/components/FinishDeckPanel";
import { getMainboardCardCount } from "@/lib/deck/formatRules";
import { getExpectedCount } from "@/lib/deck/formatCompliance";

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
  const [showFinishDeck, setShowFinishDeck] = React.useState(false);

  const formatLower = format?.toLowerCase() || '';
  const shouldCheck = formatLower && ['commander', 'standard', 'modern', 'pioneer', 'pauper'].includes(formatLower);

  const expectedCount = getExpectedCount(format) ?? (formatLower === "commander" ? 100 : 60);

  // Check card count
  React.useEffect(() => {
    if (!shouldCheck) {
      setChecking(false);
      return;
    }

    let mounted = true;
    
    /**
     * @param silent - When true (e.g. after deck:changed), refresh counts without `checking` true.
     * Otherwise the component returns null while checking, which unmounts FinishDeckPanel and
     * remounts it when done — re-running analyze and showing "Finalizing recommendations..." again.
     */
    async function checkCardCount(silent = false) {
      try {
        if (!silent) setChecking(true);
        
        // Fetch deck cards
        const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: 'no-store' });
        if (res.status === 401 || res.status === 403) {
          if (mounted) {
            if (!silent) {
              setCardCount(null);
              setViolation(null);
            }
            setChecking(false);
          }
          return;
        }
        
        const data = await res.json().catch(() => ({ ok: false }));
        if (!mounted || !data?.ok) {
          if (mounted) {
            if (!silent) {
              setCardCount(null);
              setViolation(null);
            }
            setChecking(false);
          }
          return;
        }

        const cards = Array.isArray(data.cards) ? data.cards : [];
        const totalCount = getMainboardCardCount(
          cards.map((card: { qty: number; zone?: string | null }) => ({
            qty: card.qty || 0,
            zone: card.zone,
          }))
        );
        
        if (mounted) {
          setCardCount(totalCount);
          
          // Check for violations
          if (totalCount < expectedCount) {
            setViolation({ type: 'too_few', expected: expectedCount, actual: totalCount });
          } else if (totalCount > expectedCount) {
            setViolation({ type: 'too_many', expected: expectedCount, actual: totalCount });
          } else {
            setViolation(null);
            setShowFinishDeck(false);
          }
        }
      } catch (error) {
        if (!mounted) return;
        console.error('[FormatCardCountBanner] Check failed:', error);
        if (!silent) {
          setCardCount(null);
          setViolation(null);
        }
      } finally {
        if (mounted && !silent) {
          setChecking(false);
        }
      }
    }

    // Small delay to avoid blocking initial render
    const timeoutId = setTimeout(() => { void checkCardCount(false); }, 500);
    
    // Listen for deck changes to re-check
    const handleChange = () => {
      if (mounted) {
        setDismissed(false);
        void checkCardCount(true);
      }
    };
    window.addEventListener('deck:changed', handleChange);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      window.removeEventListener('deck:changed', handleChange);
    };
  }, [deckId, formatLower, shouldCheck, expectedCount]);

  // If violation clears while modal flag is still true (e.g. fetch error), close modal without rendering invalid state
  React.useEffect(() => {
    if (showFinishDeck && !violation && cardCount !== null) {
      setShowFinishDeck(false);
    }
  }, [showFinishDeck, violation, cardCount]);

  // Don't show banner if checking, dismissed, or no violation — but keep rendering FinishDeckPanel
  // while it's open so adding a card doesn't unmount/remount the modal (see checkCardCount silent).
  const hideBanner =
    !shouldCheck || checking || dismissed || !violation || cardCount === null;
  if (hideBanner && !showFinishDeck) {
    return null;
  }

  const formatName = formatLower.charAt(0).toUpperCase() + formatLower.slice(1);
  const isTooFew = violation?.type === 'too_few';
  const difference = violation ? Math.abs(violation.actual - violation.expected) : 0;

  if (showFinishDeck && violation && cardCount !== null) {
    return (
      <FinishDeckPanel
        deckId={deckId}
        cardCount={violation.actual}
        format={format}
        onClose={() => setShowFinishDeck(false)}
      />
    );
  }

  if (!violation) {
    return null;
  }

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
            {isTooFew && shouldCheck && (
              <div className="mt-3">
                <button
                  onClick={() => setShowFinishDeck(true)}
                  className="inline-flex flex-col items-start gap-0.5 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium text-sm transition-colors shadow-md text-left"
                >
                  <span>✨ Finish This Deck</span>
                  <span className="text-xs font-normal text-purple-200/90">AI suggests cards to fill the gap</span>
                </button>
              </div>
            )}
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
