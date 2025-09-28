// app/my-decks/[id]/Client.tsx
"use client";

import React from "react";
import CardsPane from "./CardsPane";
import LegalityTokensPanel from "./LegalityTokensPanel";

export default function Client({ deckId }: { deckId?: string }) {
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
      <aside className="md:w-80 lg:w-96 flex-shrink-0">
        <LegalityTokensPanel deckId={deckId} />
      </aside>
    </div>
  );
}
