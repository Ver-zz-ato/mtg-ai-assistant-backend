// app/my-decks/[id]/Client.tsx
"use client";

import React from "react";
import CardsPane from "./CardsPane";
import LegalityTokensPanel from "./LegalityTokensPanel";
import NextDynamic from "next/dynamic";
import DeckAssistant from "./DeckAssistant";

export default function Client({ deckId, isPro }: { deckId?: string; isPro?: boolean }) {
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
    <div className="flex flex-col md:flex-row gap-4">
      <div className="flex-1 min-w-0">
        <CardsPane deckId={deckId} />
      </div>
      <aside className="md:w-72 lg:w-80 flex-shrink-0 space-y-4">
        <section className="rounded-xl border border-neutral-800 p-2 space-y-2">
          <div className="text-sm font-medium">Assistant</div>
          <div className="max-h-[360px] overflow-auto rounded border border-neutral-800">
            <DeckAssistant deckId={String(deckId)} />
          </div>
          {deckId && (<div>
            {(() => { const QA = require('./QuickAdd').default; return <QA deckId={String(deckId)} />; })()}
          </div>)}
        </section>
        <LegalityTokensPanel deckId={deckId} />
{(() => { const Prob = NextDynamic(() => import('./DeckProbabilityPanel'), { ssr: false, loading: () => (<div className="rounded-xl border border-neutral-800 p-3 text-xs opacity-70">Loading probability…</div>) }); return <Prob deckId={deckId} isPro={!!isPro} />; })()}
      </aside>
    </div>
  );
}
