// app/my-decks/[id]/Client.tsx
"use client";

import React, { useState, useEffect } from "react";
import { capture } from '@/lib/ph';
import CardsPane from "./CardsPane";
import LegalityTokensPanel from "./LegalityTokensPanel";
import NextDynamic from "next/dynamic";
import DeckAssistant from "./DeckAssistant";
import HandTestingWidget from "@/components/HandTestingWidget";
import DeckOverview from "./DeckOverview";

// Helper components for hide/show functionality
function AssistantSection({ deckId, format }: { deckId: string; format?: string }) {
  return (
    <>
      <div className="max-h-[360px] overflow-auto rounded border border-neutral-800">
        <DeckAssistant deckId={deckId} format={format} />
      </div>
      {deckId && (<div>
        {(() => { const QA = require('./QuickAdd').default; return <QA deckId={deckId} />; })()}
      </div>)}
    </>
  );
}

function HandTestingWidgetWithHide({ deckCards, deckId }: { deckCards: Array<{name: string; qty: number}>; deckId: string }) {
  const [open, setOpen] = React.useState(true);
  
  React.useEffect(() => {
    console.log('[HandTestingWidget] Setting up event listener, initial open:', open);
    
    const handler = (e: CustomEvent) => {
      console.log('[HandTestingWidget] Event received:', {
        type: e.type,
        detail: e.detail,
        action: e.detail?.action,
        show: e.detail?.show,
        currentOpen: open
      });
      
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show !== undefined ? e.detail.show : undefined;
        console.log('[HandTestingWidget] Processing toggle-all:', {
          shouldShow,
          currentOpen: open,
          willSetTo: shouldShow !== undefined ? shouldShow : 'toggle'
        });
        
        setOpen(prev => {
          const newValue = shouldShow !== undefined ? shouldShow : !prev;
          console.log('[HandTestingWidget] State update:', { prev, newValue, shouldShow });
          return newValue;
        });
      } else {
        console.log('[HandTestingWidget] Ignoring event - action is not toggle-all:', e.detail?.action);
      }
    };
    
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    console.log('[HandTestingWidget] Event listener registered');
    
    return () => {
      console.log('[HandTestingWidget] Removing event listener');
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
  const [open, setOpen] = React.useState(true);
  
  React.useEffect(() => {
    console.log('[DeckAnalyzer] Setting up event listener, initial open:', open);
    
    const handler = (e: CustomEvent) => {
      console.log('[DeckAnalyzer] Event received:', {
        type: e.type,
        detail: e.detail,
        action: e.detail?.action,
        show: e.detail?.show,
        currentOpen: open
      });
      
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show !== undefined ? e.detail.show : undefined;
        console.log('[DeckAnalyzer] Processing toggle-all:', {
          shouldShow,
          currentOpen: open,
          willSetTo: shouldShow !== undefined ? shouldShow : 'toggle'
        });
        
        setOpen(prev => {
          const newValue = shouldShow !== undefined ? shouldShow : !prev;
          console.log('[DeckAnalyzer] State update:', { prev, newValue, shouldShow });
          return newValue;
        });
      }
    };
    
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    console.log('[DeckAnalyzer] Event listener registered');
    
    return () => {
      console.log('[DeckAnalyzer] Removing event listener');
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

function DeckProbabilityWithHide({ deckId, isPro }: { deckId: string; isPro: boolean }) {
  const [open, setOpen] = React.useState(true);
  const Prob = NextDynamic(() => import('./DeckProbabilityPanel'), { ssr: false, loading: () => (<div className="rounded-xl border border-neutral-800 p-3 text-xs opacity-70">Loading probability…</div>) });
  
  React.useEffect(() => {
    console.log('[DeckProbability] Setting up event listener, initial open:', open);
    
    const handler = (e: CustomEvent) => {
      console.log('[DeckProbability] Event received:', {
        type: e.type,
        detail: e.detail,
        action: e.detail?.action,
        show: e.detail?.show,
        currentOpen: open
      });
      
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show !== undefined ? e.detail.show : undefined;
        console.log('[DeckProbability] Processing toggle-all:', {
          shouldShow,
          currentOpen: open,
          willSetTo: shouldShow !== undefined ? shouldShow : 'toggle'
        });
        
        setOpen(prev => {
          const newValue = shouldShow !== undefined ? shouldShow : !prev;
          console.log('[DeckProbability] State update:', { prev, newValue, shouldShow });
          return newValue;
        });
      }
    };
    
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    console.log('[DeckProbability] Event listener registered');
    
    return () => {
      console.log('[DeckProbability] Removing event listener');
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

export default function Client({ deckId, isPro, format, commander, colors, deckAim }: { deckId?: string; isPro?: boolean; format?: string; commander?: string | null; colors?: string[]; deckAim?: string | null }) {
  const [deckCards, setDeckCards] = useState<Array<{name: string; qty: number}>>([]);
  
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
        console.error('Failed to fetch deck cards:', error);
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
    <div className="flex flex-col xl:flex-row gap-4 max-w-full overflow-x-auto">
      <div className="flex-1 min-w-0">
        {/* Deck Overview - right above decklist */}
        {format?.toLowerCase() === 'commander' && (
          <DeckOverview 
            deckId={deckId!}
            initialCommander={commander || null}
            initialColors={colors || []}
            initialAim={deckAim || null}
            format={format}
          />
        )}
        <CardsPane deckId={deckId} />
      </div>
      <aside className="md:w-80 lg:w-96 xl:w-[30rem] 2xl:w-[36rem] flex-shrink-0 space-y-4">
        <AssistantSection deckId={String(deckId)} format={format} />
        
        {/* Card Recommendations */}
        {(() => { 
          try {
            const DeckCardRecs = require('@/components/DeckCardRecommendations').default;
            return <DeckCardRecs 
              deckId={String(deckId)} 
              onAddCard={async (cardName: string) => {
                try {
                  const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(String(deckId))}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: cardName, qty: 1 })
                  });
                  const data = await res.json();
                  if (data.ok) {
                    window.dispatchEvent(new Event('deck:changed'));
                    window.dispatchEvent(new CustomEvent("toast", { detail: `Added ${cardName}` }));
                  } else {
                    alert(data.error || 'Failed to add card');
                  }
                } catch (e: any) {
                  alert(e?.message || 'Failed to add card');
                }
              }}
            />;
          } catch {
            return null;
          }
        })()}
        
        {/* Hand Testing Widget */}
        <HandTestingWidgetWithHide 
          deckCards={deckCards}
          deckId={deckId}
        />
        
        {/* Deck Analyzer */}
        <DeckAnalyzerWithHide 
          deckId={deckId}
          isPro={!!isPro}
          format={format}
        />
        
        <LegalityTokensPanel deckId={deckId} format={format} />
        <DeckProbabilityWithHide deckId={deckId} isPro={!!isPro} />
      </aside>
    </div>
  );
}
