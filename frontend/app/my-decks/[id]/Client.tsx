// app/my-decks/[id]/Client.tsx
"use client";

import React from "react";
import CardsPane from "./CardsPane";

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
    <div className="flex flex-col gap-3">
      <CardsPane deckId={deckId} />
    </div>
  );
}
