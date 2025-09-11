// app/my-decks/[id]/Client.tsx
"use client";
import CardsPane from "./CardsPane";

export default function Client({ deckId }: { deckId?: string }) {
  // Keep your existing add/edit/delete UI above/below this line.
  // This shim just ensures there's a visible list fed from the API.
  return (
    <div>
      {/* your existing form & controls stay as-is */}
      <CardsPane deckId={deckId} />
    </div>
  );
}
