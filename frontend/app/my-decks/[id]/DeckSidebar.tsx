"use client";

import React, { useState, useEffect } from "react";
import NextDynamic from "next/dynamic";
import DeckAssistant from "./DeckAssistant";
import HandTestingWidget from "@/components/HandTestingWidget";

// Helper components for hide/show functionality
function AssistantSection({ deckId, format }: { deckId: string; format?: string }) {
  const [open, setOpen] = React.useState(false); // Collapsed by default
  
  React.useEffect(() => {
    // Listen for health click or analyzer run to auto-expand
    const healthHandler = (e: CustomEvent) => {
      if (e.detail?.context === 'health_warning' || e.detail?.category) {
        setOpen(true);
      }
    };
    window.addEventListener('ai-assistant:open' as any, healthHandler as EventListener);
    
    // Listen for analyzer run
    const analyzerHandler = () => {
      setOpen(true);
    };
    window.addEventListener('deck:analyzer:ran' as any, analyzerHandler as EventListener);
    
    // Listen for toggle all
    const toggleHandler = (e: CustomEvent) => {
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show;
        if (shouldShow !== undefined) {
          setOpen(Boolean(shouldShow));
        }
      }
    };
    window.addEventListener('side-panels-toggle' as any, toggleHandler as EventListener);
    
    return () => {
      window.removeEventListener('ai-assistant:open' as any, healthHandler as EventListener);
      window.removeEventListener('deck:analyzer:ran' as any, analyzerHandler as EventListener);
      window.removeEventListener('side-panels-toggle' as any, toggleHandler as EventListener);
    };
  }, []);
  
  return (
    <>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30 hover:border-purple-400/50 hover:from-purple-600/30 hover:to-blue-600/30 transition-all text-sm font-medium text-purple-300 hover:text-purple-200 flex items-center justify-center gap-2 group"
          title="Ask AI about this deck"
        >
          <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Ask AI about this deck
          <span className="text-xs opacity-60 group-hover:opacity-80">→</span>
        </button>
      ) : (
        <>
          <div className="max-h-[360px] overflow-auto rounded border border-neutral-800">
            <DeckAssistant deckId={deckId} format={format} />
          </div>
        </>
      )}
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
      
      // If name needs fixing, show alert and don't add — unless the only difference is capitalization
      // Also skip if the card name (case-insensitive) matches any suggestion exactly
      if (suggestion && suggestion !== cardName && allSuggestions.length > 0) {
        const caseOnly = suggestion.toLowerCase() === cardName.toLowerCase();
        const matchesSuggestion = allSuggestions.some((s: string) => s.toLowerCase() === cardName.toLowerCase());
        
        if (caseOnly || matchesSuggestion) {
          // Same name, different casing, or matches a suggestion exactly — use canonical form, no prompt
          cardName = suggestion;
        } else {
          const confirmed = confirm(`Did you mean "${suggestion}" instead of "${cardName}"? Click OK to use "${suggestion}" or Cancel to skip.`);
          if (confirmed && suggestion) {
            cardName = suggestion;
          } else {
            return; // User cancelled, don't add
          }
        }
      }
    } catch (validationError) {
      console.warn('Validation check failed, proceeding anyway:', validationError);
    }
    
    try {
      // Get previous state for undo
      const prevRes = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(String(deckId))}`);
      const prevJson = await prevRes.json().catch(()=>({ ok: false }));
      const prevCard = prevJson?.ok ? (prevJson.cards || []).find((c: any) => c.name === cardName) : null;
      const prevQty = prevCard?.qty || 0;
      
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(String(deckId))}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cardName, qty: 1 })
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to add card');
        return;
      }
      
      const newQty = data?.qty || 1;
      const wasMerged = data?.merged || false;
      const message = wasMerged && prevQty > 0 
        ? `Added ${cardName} (now ${newQty} total)`
        : `Added ${cardName}`;
      
      window.dispatchEvent(new Event('deck:changed'));
      
      // Show undo toast
      const { undoToastManager } = await import('@/lib/undo-toast');
      undoToastManager.showUndo({
        id: `add-recommendation-${deckId}-${cardName}-${Date.now()}`,
        message,
        duration: 5000,
        onUndo: async () => {
          if (wasMerged && prevQty > 0) {
            await fetch(`/api/decks/cards?deckid=${encodeURIComponent(String(deckId))}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: cardName, qty: prevQty })
            });
          } else {
            await fetch(`/api/decks/cards?deckid=${encodeURIComponent(String(deckId))}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: cardName, qty: 1 })
            });
          }
          window.dispatchEvent(new Event('deck:changed'));
        },
        onExecute: () => {}
      });
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
      
      {/* Deck Checks - Merged Analyzer + Legality */}
      {(() => {
        try {
          const DeckChecks = require('./DeckChecksPanel').default;
          return <DeckChecks deckId={deckId} isPro={isPro} format={format} />;
        } catch {
          // Fallback to old panels if new component fails
          return (
            <DeckAnalyzerWithHide deckId={deckId} isPro={isPro} format={format} />
          );
        }
      })()}
      
      <DeckProbabilityWithHide deckId={deckId} isPro={isPro} />
    </div>
  );
}
