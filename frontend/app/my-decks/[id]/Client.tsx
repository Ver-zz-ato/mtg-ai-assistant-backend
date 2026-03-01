// app/my-decks/[id]/Client.tsx
"use client";

import React, { useState, useEffect } from "react";
import { capture } from '@/lib/ph';
import CardsPane from "./CardsPane";
import LegalityTokensPanel from "./LegalityTokensPanel";
import PopularCardsPanel from "./PopularCardsPanel";
import NextDynamic from "next/dynamic";
import DeckAssistant from "./DeckAssistant";
import HandTestingWidget from "@/components/HandTestingWidget";
import DeckOverview from "./DeckOverview";
import UnrecognizedCardsBanner from "@/components/UnrecognizedCardsBanner";
import ColorIdentityBanner from "@/components/ColorIdentityBanner";
import FormatCardCountBanner from "@/components/FormatCardCountBanner";
import SingletonViolationBanner from "@/components/SingletonViolationBanner";
import BannedCardsBanner from "@/components/BannedCardsBanner";
import FixNamesModal from "./FixNamesModal";

// Helper components for hide/show functionality
function AssistantSection({ deckId, format }: { deckId: string; format?: string }) {
  const [open, setOpen] = React.useState(true);
  
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show;
        if (shouldShow !== undefined) {
          setOpen(Boolean(shouldShow));
        }
      }
    };
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    return () => window.removeEventListener('side-panels-toggle' as any, handler as EventListener);
  }, []);
  
  if (!open) return null;
  
  return (
    <>
      <div className="rounded border border-neutral-800 overflow-hidden">
        <DeckAssistant deckId={deckId} format={format} />
      </div>
    </>
  );
}

function HandTestingWidgetWithHide({ deckCards, deckId }: { deckCards: Array<{name: string; qty: number}>; deckId: string }) {
  const [open, setOpen] = React.useState(true);
  
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.action === 'toggle-all') {
        // e.detail.show can be true or false - we use it directly
        const shouldShow = e.detail?.show;
        
        setOpen(prev => {
          // If shouldShow is explicitly true/false, use it; otherwise toggle
          const newValue = shouldShow !== undefined ? Boolean(shouldShow) : !prev;
          return newValue;
        });
      }
    };
    
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    
    return () => {
      window.removeEventListener('side-panels-toggle' as any, handler as EventListener);
    };
  }, []);
  
  return (
    <section className="rounded-xl border border-neutral-800 min-w-0 w-full">
      <div className="flex items-center justify-between mb-2 p-2">
        <div className="text-sm font-medium">Hand Testing</div>
        <button onClick={() => setOpen(v=>!v)} className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs transition-colors">
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <HandTestingWidget 
          deckCards={deckCards}
          deckId={deckId}
          compact={false}
          className="w-full"
        />
      )}
    </section>
  );
}

function DeckAnalyzerWithHide({ deckId, isPro, format }: { deckId: string; isPro: boolean; format?: string }) {
  const [open, setOpen] = React.useState(false);
  
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show;
        
        setOpen(prev => {
          const newValue = shouldShow !== undefined ? Boolean(shouldShow) : !prev;
          return newValue;
        });
      }
    };
    
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    
    return () => {
      window.removeEventListener('side-panels-toggle' as any, handler as EventListener);
    };
  }, []);
  
  return (
    <div className="rounded-xl border border-neutral-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Deck Analyzer</div>
        <button onClick={() => setOpen(v=>!v)} className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs transition-colors">
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <div className="mt-2">
          {(() => { const Lazy = require('./AnalyzerLazy').default; return <Lazy deckId={deckId} proAuto={!!isPro} format={format} />; })()}
        </div>
      )}
    </div>
  );
}

function DeckCardRecommendationsWithHide({ deckId, onAddCard }: { deckId: string; onAddCard: (cardName: string) => Promise<void> }) {
  // Start with consistent default for SSR, then adjust on client
  const [open, setOpen] = React.useState(true);
  
  // Adjust based on viewport after mount to avoid hydration mismatch
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setOpen(false);
    }
  }, []);
  
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show;
        if (shouldShow !== undefined) {
          setOpen(Boolean(shouldShow));
        }
      }
    };
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    return () => window.removeEventListener('side-panels-toggle' as any, handler as EventListener);
  }, []);
  
  if (!open) return null;
  
  try {
    const DeckCardRecs = require('@/components/DeckCardRecommendations').default;
    return <DeckCardRecs deckId={deckId} onAddCard={onAddCard} />;
  } catch {
    return null;
  }
}

function DeckProbabilityWithHide({ deckId, isPro }: { deckId: string; isPro: boolean }) {
  // Start hidden by default
  const [open, setOpen] = React.useState(false);
  const Prob = NextDynamic(() => import('./DeckProbabilityPanel'), { ssr: false, loading: () => (<div className="rounded-xl border border-neutral-800 p-3 text-xs opacity-70">Loading probability…</div>) });
  
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show;
        
        setOpen(prev => {
          const newValue = shouldShow !== undefined ? Boolean(shouldShow) : !prev;
          return newValue;
        });
      }
    };
    
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    
    return () => {
      window.removeEventListener('side-panels-toggle' as any, handler as EventListener);
    };
  }, []);
  
  return (
    <div className="rounded-xl border border-neutral-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Probability Calculator</div>
        <button onClick={() => setOpen(v=>!v)} className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs transition-colors">
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <div className="mt-2">
          <Prob deckId={deckId} isPro={isPro} />
        </div>
      )}
    </div>
  );
}

export default function Client({ deckId, isPro, format, commander, colors, deckAim, healthMetrics }: { deckId?: string; isPro?: boolean; format?: string; commander?: string | null; colors?: string[]; deckAim?: string | null; healthMetrics?: { lands: number; ramp: number; draw: number; removal: number } | null }) {
  const [deckCards, setDeckCards] = useState<Array<{name: string; qty: number}>>([]);
  const [fixModalOpen, setFixModalOpen] = useState(false);
  
  // Track deck editor opened and fetch deck cards for hand testing
  useEffect(() => {
    if (!deckId) return;
    
    // Track deck editor engagement
    capture('deck_editor_opened', { 
      deck_id: deckId, 
      source: typeof window !== 'undefined' && document.referrer.includes('/my-decks') ? 'my_decks' : 'direct'
    });
    
    const fetchCards = async () => {
      try {
        const res = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({ ok: false }));
        if (json?.ok) {
          setDeckCards(json.cards || []);
        }
      } catch (error) {
        // Silently fail
      }
    };
    
    fetchCards();
    
    // Listen for deck changes to refresh cards
    const handleDeckChange = () => fetchCards();
    window.addEventListener('deck:changed', handleDeckChange);
    
    return () => {
      window.removeEventListener('deck:changed', handleDeckChange);
    };
  }, [deckId]);
  
  if (!deckId) {
    return (
      <div className="text-sm text-red-400">
        Deck not found (missing deckId).
      </div>
    );
  }

  // NOTE:
  // - Do NOT render a separate EditorAddBar here.
  // - CardsPane already contains the searchable add bar (autocomplete + Add).
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="min-w-0">
        {/* Unrecognized Cards Banner - shows above decklist if cards need fixing */}
        <UnrecognizedCardsBanner 
          type="deck" 
          id={deckId} 
          onFix={() => {
            // Only open if Pro (checking Pro status from parent)
            if (!isPro) {
              try {
                import('@/lib/pro-ux').then(({ showProToast }) => showProToast()).catch(() => {
                  alert('This is a Pro feature. Upgrade to unlock.');
                });
              } catch {
                alert('This is a Pro feature. Upgrade to unlock.');
              }
              return;
            }
            setFixModalOpen(true);
          }} 
        />

        {/* Format-specific warning banners */}
        {format && (
          <>
            <FormatCardCountBanner deckId={deckId!} format={format} />
            {format.toLowerCase() === 'commander' && (
              <SingletonViolationBanner deckId={deckId!} />
            )}
            <BannedCardsBanner deckId={deckId!} format={format} />
          </>
        )}
        
        {/* Color Identity Banner - shows if deck has illegal colors */}
        {format?.toLowerCase() === 'commander' && commander && (colors || []).length > 0 && (
          <ColorIdentityBanner 
            deckId={deckId!}
            commander={commander}
            allowedColors={colors || []}
            format={format}
          />
        )}
        
        {/* Deck Overview - right above decklist */}
        {format?.toLowerCase() === 'commander' && (
          <DeckOverview 
            deckId={deckId!}
            initialCommander={commander || null}
            initialColors={colors || []}
            initialAim={deckAim || null}
            format={format}
            healthMetrics={healthMetrics || null}
            isPro={isPro || false}
          />
        )}
        <CardsPane deckId={deckId} format={format} allowedColors={colors || []} />
      </div>
      
      {/* Fix Names Modal - triggered by banner or FunctionsPanel button */}
      {fixModalOpen && (
        <FixNamesModal 
          deckId={deckId} 
          open={fixModalOpen} 
          onClose={() => {
            setFixModalOpen(false);
            // Refresh deck to update banner after fixes
            window.dispatchEvent(new Event('deck:changed'));
          }} 
        />
      )}
    </div>
  );
}
