"use client";

import React from "react";
import { useProStatus } from "@/hooks/useProStatus";

type UnrecognizedCardsBannerProps = {
  type: 'deck' | 'collection';
  id: string;
  onFix: () => void; // Callback to open fix modal
};

/**
 * Banner that automatically checks for unrecognized cards and prompts user to fix them
 * Appears when deck/collection has cards that need fixing
 */
export default function UnrecognizedCardsBanner({ type, id, onFix }: UnrecognizedCardsBannerProps) {
  const [checking, setChecking] = React.useState(true);
  const [unrecognizedCount, setUnrecognizedCount] = React.useState<number | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const { isPro } = useProStatus();

  // Check for unrecognized cards on mount and when deck/collection changes
  React.useEffect(() => {
    let mounted = true;
    
    async function checkUnrecognized() {
      try {
        setChecking(true);
        const endpoint = type === 'deck' 
          ? `/api/decks/fix-names?deckId=${encodeURIComponent(id)}`
          : `/api/collections/fix-names?collectionId=${encodeURIComponent(id)}`;
        
        const res = await fetch(endpoint, { cache: 'no-store' });
        
        // Don't check if request fails (401 = not authenticated, etc.)
        if (res.status === 401 || res.status === 403) {
          if (mounted) {
            setUnrecognizedCount(null);
            setChecking(false);
          }
          return;
        }
        
        const data = await res.json().catch(() => ({ ok: false }));
        
        if (!mounted) return;
        
        if (data?.ok === true) {
          const items = Array.isArray(data.items) ? data.items : [];
          setUnrecognizedCount(items.length);
        } else {
          setUnrecognizedCount(null);
        }
      } catch (error) {
        if (!mounted) return;
        console.error('[UnrecognizedCardsBanner] Check failed:', error);
        setUnrecognizedCount(null);
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    // Small delay to avoid blocking initial render
    const timeoutId = setTimeout(checkUnrecognized, 500);
    
    // Also listen for deck/collection changes to re-check (e.g., after fixes are applied)
    const handleChange = () => {
      if (mounted) {
        // Reset dismissed state when deck/collection changes (user might have fixed cards)
        setDismissed(false);
        checkUnrecognized();
      }
    };
    window.addEventListener('deck:changed', handleChange);
    window.addEventListener('collection:changed', handleChange);
    
    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      window.removeEventListener('deck:changed', handleChange);
      window.removeEventListener('collection:changed', handleChange);
    };
  }, [type, id]);

  // Don't show if checking, dismissed, or no unrecognized cards
  if (checking || dismissed || unrecognizedCount === null || unrecognizedCount === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-orange-500/50 bg-gradient-to-r from-orange-900/40 to-red-900/40 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="text-2xl flex-shrink-0">⚠️</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-orange-300 mb-1">
              {unrecognizedCount} unrecognized card{unrecognizedCount !== 1 ? 's' : ''} found
            </div>
            <div className="text-sm text-orange-200/80">
              Some card names couldn't be matched to our database. Fix them to enable features like card images, prices, and analysis.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isPro ? (
            <button
              onClick={onFix}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-sm font-semibold transition-all shadow-md hover:shadow-lg"
            >
              Fix Now
            </button>
          ) : (
            <button
              onClick={() => {
                // Show Pro upgrade prompt
                try {
                  import('@/lib/pro-ux').then(({ showProToast }) => showProToast()).catch(() => {
                    alert('This is a Pro feature. Upgrade to unlock.');
                  });
                } catch {
                  alert('This is a Pro feature. Upgrade to unlock.');
                }
              }}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600/60 to-red-600/60 text-white/80 text-sm font-semibold transition-all shadow-md cursor-pointer relative"
            >
              Fix Now
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-300 text-black font-bold uppercase">PRO</span>
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="px-3 py-2 rounded-lg border border-orange-500/50 hover:bg-orange-900/30 text-orange-300 text-sm font-medium transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
