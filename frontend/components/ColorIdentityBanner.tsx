"use client";

import React from "react";

type ColorIdentityBannerProps = {
  deckId: string;
  commander: string | null;
  allowedColors: string[];
  format?: string;
};

function isWithinColorIdentity(cardColors: string[], allowedColors: string[]): boolean {
  if (cardColors.length === 0) return true; // Colorless allowed
  if (allowedColors.length === 0) return false;
  const allowed = new Set(allowedColors.map((c) => c.toUpperCase()));
  return cardColors.every((c) => allowed.has(c.toUpperCase()));
}

/**
 * Banner that checks for illegal color identity cards in Commander decks.
 * Uses batch-metadata (Scryfall cache) - no LLM / deck analyze API.
 */
export default function ColorIdentityBanner({ deckId, commander, allowedColors, format }: ColorIdentityBannerProps) {
  const [checking, setChecking] = React.useState(true);
  const [illegalCards, setIllegalCards] = React.useState<Array<{ name: string; colors: string[] }>>([]);
  const [dismissed, setDismissed] = React.useState(false);

  const shouldCheck = format?.toLowerCase() === 'commander' && commander && allowedColors.length > 0;

  React.useEffect(() => {
    if (!shouldCheck) {
      setChecking(false);
      return;
    }

    let mounted = true;

    async function checkColorIdentity() {
      try {
        setChecking(true);

        const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: 'no-store' });
        if (res.status === 401 || res.status === 403) {
          if (mounted) {
            setIllegalCards([]);
            setChecking(false);
          }
          return;
        }

        const data = await res.json().catch(() => ({ ok: false }));
        if (!mounted || !data?.ok) {
          if (mounted) {
            setIllegalCards([]);
            setChecking(false);
          }
          return;
        }

        const cards = Array.isArray(data.cards) ? data.cards : [];
        const names = cards.map((c: { name: string }) => String(c.name || '').trim()).filter(Boolean);
        if (names.length === 0) {
          if (mounted) setIllegalCards([]);
          return;
        }

        const metaRes = await fetch('/api/cards/batch-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names }),
        });
        const metaJson = await metaRes.json().catch(() => ({ data: [] }));
        const metaList = Array.isArray(metaJson.data) ? metaJson.data : [];

        const illegal: Array<{ name: string; colors: string[] }> = [];
        for (const m of metaList) {
          const cardColors = Array.isArray(m.color_identity) ? m.color_identity : [];
          if (!isWithinColorIdentity(cardColors, allowedColors)) {
            illegal.push({
              name: m.name || '',
              colors: cardColors,
            });
          }
        }

        if (mounted) {
          setIllegalCards(illegal);
        }
      } catch (error) {
        if (!mounted) return;
        console.error('[ColorIdentityBanner] Check failed:', error);
        setIllegalCards([]);
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    const timeoutId = setTimeout(checkColorIdentity, 500);

    const handleChange = () => {
      if (mounted) {
        setDismissed(false);
        checkColorIdentity();
      }
    };
    window.addEventListener('deck:changed', handleChange);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      window.removeEventListener('deck:changed', handleChange);
    };
  }, [deckId, commander, allowedColors.join(','), shouldCheck]);

  if (!shouldCheck || checking || dismissed || illegalCards.length === 0) {
    return null;
  }

  const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
  const allowedColorNames = allowedColors.map(c => colorNames[c.toUpperCase()] || c).join(', ');

  return (
    <div className="mb-4 rounded-lg border border-red-500/50 bg-gradient-to-r from-red-900/40 to-orange-900/40 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="text-2xl flex-shrink-0">🚫</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-red-300 mb-1">
              Color Identity Violation
            </div>
            <div className="text-sm text-red-200/80 mb-2">
              This Commander deck has <strong>{illegalCards.length} card{illegalCards.length !== 1 ? 's' : ''}</strong> outside your commander's color identity ({allowedColorNames}).
            </div>
            <div className="text-xs text-red-200/70 font-mono max-h-32 overflow-y-auto">
              {illegalCards.slice(0, 10).map(c => {
                const cardColors = c.colors.map(col => colorNames[col] || col).join('/');
                return <div key={c.name} className="truncate">• {c.name} ({cardColors})</div>;
              })}
              {illegalCards.length > 10 && <div className="text-red-300/60">... and {illegalCards.length - 10} more</div>}
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
