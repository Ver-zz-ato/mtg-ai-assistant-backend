"use client";

import HandTestingWidget from "@/components/mulligan/HandTestingWidget";

export default function HandTestingSection({
  deckId,
  deckCards,
  commanderName,
}: {
  deckId: string;
  deckCards: Array<{ name: string; qty: number }>;
  commanderName: string | null;
}) {
  return (
    <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-1 w-1 rounded-full bg-amber-400 animate-pulse shadow-lg shadow-amber-400/50" />
        <h2 className="text-base font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
          Test opening hands with this deck
        </h2>
      </div>
      <p className="text-xs text-neutral-400 mb-3">
        Draw hands and practice mulligan decisions with London mulligan rules.
      </p>
      <HandTestingWidget
        mode="DECK"
        deckId={deckId}
        deckCards={deckCards}
        commanderName={commanderName}
        placement="DECK_PAGE"
        compact={false}
        className="w-full border-0 rounded-none bg-transparent p-0"
      />
    </div>
  );
}
