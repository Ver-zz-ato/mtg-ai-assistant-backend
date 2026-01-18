"use client";

import React from "react";

type ColorIdentityBannerProps = {
  deckId: string;
  commander: string | null;
  allowedColors: string[];
  format?: string;
};

/**
 * Banner that checks for illegal color identity cards in Commander decks
 * Appears when deck has cards outside the commander's color identity
 */
export default function ColorIdentityBanner({ deckId, commander, allowedColors, format }: ColorIdentityBannerProps) {
  const [checking, setChecking] = React.useState(true);
  const [illegalCards, setIllegalCards] = React.useState<Array<{ name: string; colors: string[] }>>([]);
  const [dismissed, setDismissed] = React.useState(false);

  // Only check for Commander format with a commander and allowed colors
  const shouldCheck = format?.toLowerCase() === 'commander' && commander && allowedColors.length > 0;

  // Check for illegal color identity cards
  React.useEffect(() => {
    if (!shouldCheck) {
      setChecking(false);
      return;
    }

    let mounted = true;
    
    async function checkColorIdentity() {
      try {
        setChecking(true);
        
        // Fetch deck cards
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
        
        // Use deck analyze API to check for illegal colors (it already does this check efficiently)
        const deckText = cards.map((c: any) => `${c.qty} ${c.name}`).join('\n');
        try {
          const analyzeRes = await fetch('/api/deck/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deckText,
              format: 'Commander',
              useScryfall: true,
              colors: allowedColors
            })
          });
          
          const analyzeJson = await analyzeRes.json().catch(() => ({ ok: false }));
          if (analyzeJson?.ok && Array.isArray(analyzeJson.illegalExamples)) {
            // Map illegal examples to card objects with colors
            const illegalExamples = analyzeJson.illegalExamples || [];
            const illegal: Array<{ name: string; colors: string[] }> = [];
            
            // For each illegal card, fetch its color identity to display
            for (const cardName of illegalExamples.slice(0, 20)) { // Limit to first 20
              try {
                const colorCheckRes = await fetch(`/api/cards/color-check?name=${encodeURIComponent(cardName)}&allowedColors=${allowedColors.join(',')}`);
                const colorCheckJson = await colorCheckRes.json().catch(() => ({ ok: false }));
                if (colorCheckJson.cardColors) {
                  illegal.push({ name: cardName, colors: colorCheckJson.cardColors });
                } else {
                  illegal.push({ name: cardName, colors: [] });
                }
              } catch (e) {
                illegal.push({ name: cardName, colors: [] });
              }
            }
            
            if (mounted) {
              setIllegalCards(illegal);
            }
            return;
          }
        } catch (e) {
          console.warn('[ColorIdentityBanner] Analyze API check failed:', e);
        }
        
        // Fallback: if analyze API fails, set empty
        if (mounted) {
          setIllegalCards([]);
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

    // Small delay to avoid blocking initial render
    const timeoutId = setTimeout(checkColorIdentity, 500);
    
    // Listen for deck changes to re-check
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

  // Don't show if checking, dismissed, or no illegal cards
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
