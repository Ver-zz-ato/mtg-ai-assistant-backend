// app/my-decks/[id]/Client.tsx
"use client";

import React, { useState, useEffect } from "react";
import { capture } from '@/lib/ph';
import CardsPane from "./CardsPane";
import LegalityTokensPanel from "./LegalityTokensPanel";
import NextDynamic from "next/dynamic";
import DeckAssistant from "./DeckAssistant";
import HandTestingWidget from "@/components/HandTestingWidget";

export default function Client({ deckId, isPro }: { deckId?: string; isPro?: boolean }) {
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
        <CardsPane deckId={deckId} />
      </div>
      <aside className="md:w-80 lg:w-96 xl:w-[30rem] 2xl:w-[36rem] flex-shrink-0 space-y-4">
        <section className="rounded-xl border border-neutral-800 p-2 space-y-2">
          <div className="text-sm font-medium">Assistant</div>
          <div className="max-h-[360px] overflow-auto rounded border border-neutral-800">
            <DeckAssistant deckId={String(deckId)} />
          </div>
          {deckId && (<div>
            {(() => { const QA = require('./QuickAdd').default; return <QA deckId={String(deckId)} />; })()}
          </div>)}
        </section>
        
        {/* Hand Testing Widget */}
        <section className="rounded-xl border border-neutral-800 min-w-0">
          <HandTestingWidget 
            deckCards={deckCards}
            deckId={deckId}
            compact={false}
            className=""
          />
        </section>
        
        <LegalityTokensPanel deckId={deckId} />
{(() => { const Prob = NextDynamic(() => import('./DeckProbabilityPanel'), { ssr: false, loading: () => (<div className="rounded-xl border border-neutral-800 p-3 text-xs opacity-70">Loading probability…</div>) }); return <Prob deckId={deckId} isPro={!!isPro} />; })()}
      </aside>
    </div>
  );
}
