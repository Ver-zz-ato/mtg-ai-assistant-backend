"use client";

import React, { useState, useEffect } from "react";
import NextDynamic from "next/dynamic";
import DeckAssistant from "./DeckAssistant";
import HandTestingWidget from "@/components/HandTestingWidget";
import LegalityTokensPanel from "./LegalityTokensPanel";
import PopularCardsPanel from "./PopularCardsPanel";

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
  const [open, setOpen] = React.useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 768;
  });
  
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

export default function DeckSidebar({ 
  deckId, 
  isPro, 
  format,
  commander 
}: { 
  deckId: string; 
  isPro: boolean; 
  format?: string;
  commander?: string | null;
}) {
  const [deckCards, setDeckCards] = useState<Array<{name: string; qty: number}>>([]);
  
  useEffect(() => {
    if (!deckId) return;
    
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
    
    const handleDeckChange = () => fetchCards();
    window.addEventListener('deck:changed', handleDeckChange);
    
    return () => {
      window.removeEventListener('deck:changed', handleDeckChange);
    };
  }, [deckId]);

  const handleAddCard = async (cardName: string) => {
    // Validate card name before adding
    try {
      const validationRes = await fetch('/api/cards/fuzzy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: [cardName] })
      });
      const validationJson = await validationRes.json().catch(() => ({}));
      const fuzzyResults = validationJson?.results || {};
      
      const suggestion = fuzzyResults[cardName]?.suggestion;
      const allSuggestions = Array.isArray(fuzzyResults[cardName]?.all) ? fuzzyResults[cardName].all : [];
      
      // If name needs fixing, show alert and don't add
      if (suggestion && suggestion !== cardName && allSuggestions.length > 0) {
        const confirmed = confirm(`Did you mean "${suggestion}" instead of "${cardName}"? Click OK to use "${suggestion}" or Cancel to skip.`);
        if (confirmed && suggestion) {
          cardName = suggestion;
        } else {
          return; // User cancelled, don't add
        }
      }
    } catch (validationError) {
      console.warn('Validation check failed, proceeding anyway:', validationError);
    }
    
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
  };

  return (
    <div className="space-y-4">
      {/* AI Assistant - Grouped header */}
      <div className="rounded-xl border border-purple-800/50 bg-purple-950/20 p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-1 w-1 rounded-full bg-purple-400 animate-pulse"></div>
          <h3 className="text-sm font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
            AI Assistant
          </h3>
        </div>
        <div className="space-y-4">
          <AssistantSection deckId={deckId} format={format} />
          
          {/* Card Recommendations */}
          <DeckCardRecommendationsWithHide
            deckId={deckId}
            onAddCard={handleAddCard}
          />
          
          {/* Hand Testing Widget */}
          <HandTestingWidgetWithHide 
            deckCards={deckCards}
            deckId={deckId}
          />
        </div>
      </div>
      
      {/* Secondary tools - collapsed by default */}
      <DeckAnalyzerWithHide 
        deckId={deckId}
        isPro={isPro}
        format={format}
      />
      
      <LegalityTokensPanel deckId={deckId} format={format} />
      
      {/* Popular for this Commander - only show for Commander format */}
      {format?.toLowerCase() === 'commander' && commander && (
        <PopularCardsPanel
          commander={commander}
          deckId={deckId}
          onAddCard={handleAddCard}
        />
      )}
      
      <DeckProbabilityWithHide deckId={deckId} isPro={isPro} />
    </div>
  );
}
