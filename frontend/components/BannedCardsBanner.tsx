"use client";

import React from "react";
import { BANNED_LISTS } from "@/lib/deck/banned-cards";

type BannedCardsBannerProps = {
  deckId: string;
  format?: string;
};

/**
 * Banner that checks for banned cards in the deck based on format.
 * Uses direct banned list lookup (no LLM / deck analyze API).
 */
export default function BannedCardsBanner({ deckId, format }: BannedCardsBannerProps) {
  const [checking, setChecking] = React.useState(true);
  const [bannedCards, setBannedCards] = React.useState<Array<{ name: string; reason?: string }>>([]);
  const [dismissed, setDismissed] = React.useState(false);

  const formatLower = format?.toLowerCase() || '';
  const shouldCheck = formatLower && ['commander', 'standard', 'modern', 'pioneer', 'pauper'].includes(formatLower);

  // Check for banned cards via direct lookup (no AI)
  React.useEffect(() => {
    if (!shouldCheck) {
      setChecking(false);
      return;
    }

    let mounted = true;

    async function checkBannedCards() {
      try {
        setChecking(true);

        const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: 'no-store' });
        if (res.status === 401 || res.status === 403) {
          if (mounted) {
            setBannedCards([]);
            setChecking(false);
          }
          return;
        }

        const data = await res.json().catch(() => ({ ok: false }));
        if (!mounted || !data?.ok) {
          if (mounted) {
            setBannedCards([]);
            setChecking(false);
          }
          return;
        }

        const cards = Array.isArray(data.cards) ? data.cards : [];
        const formatCapitalized = formatLower.charAt(0).toUpperCase() + formatLower.slice(1);
        const bannedMap = BANNED_LISTS[formatCapitalized] || {};
        const bannedSet = new Set(Object.keys(bannedMap).map((k) => k.toLowerCase()));

        const bannedList: Array<{ name: string }> = [];
        for (const card of cards) {
          const cardName = String(card.name || '').trim();
          if (bannedSet.has(cardName.toLowerCase())) {
            bannedList.push({ name: cardName });
          }
        }

        if (mounted) {
          setBannedCards(bannedList);
        }
      } catch (error) {
        if (!mounted) return;
        console.error('[BannedCardsBanner] Check failed:', error);
        setBannedCards([]);
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    const timeoutId = setTimeout(checkBannedCards, 500);

    const handleChange = () => {
      if (mounted) {
        setDismissed(false);
        checkBannedCards();
      }
    };
    window.addEventListener('deck:changed', handleChange);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      window.removeEventListener('deck:changed', handleChange);
    };
  }, [deckId, formatLower, shouldCheck]);

  if (!shouldCheck || checking || dismissed || bannedCards.length === 0) {
    return null;
  }

  const formatName = formatLower.charAt(0).toUpperCase() + formatLower.slice(1);

  return (
    <div className="mb-4 rounded-lg border border-red-500/50 bg-gradient-to-r from-red-900/40 to-pink-900/40 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="text-2xl flex-shrink-0">🚫</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-red-300 mb-1">
              Banned Cards Detected
            </div>
            <div className="text-sm text-red-200/80 mb-2">
              This {formatName} deck contains <strong>{bannedCards.length} banned card{bannedCards.length !== 1 ? 's' : ''}</strong>. These cards are not legal in {formatName} and must be removed.
            </div>
            <div className="text-xs text-red-200/70 font-mono max-h-32 overflow-y-auto">
              {bannedCards.slice(0, 10).map(c => (
                <div key={c.name} className="truncate">• {c.name}</div>
              ))}
              {bannedCards.length > 10 && <div className="text-red-300/60">... and {bannedCards.length - 10} more</div>}
            </div>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="px-3 py-2 rounded-lg border border-red-500/50 hover:bg-red-900/30 text-red-300 text-sm font-medium transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
