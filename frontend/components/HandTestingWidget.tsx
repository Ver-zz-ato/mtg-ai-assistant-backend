"use client";

import HandTestingWidgetShared from "@/components/mulligan/HandTestingWidget";

type Card = {
  name: string;
  qty: number;
  image_url?: string;
  mana_cost?: string;
  type_line?: string;
};

interface HandTestingWidgetProps {
  deckCards: Card[];
  deckId?: string;
  compact?: boolean;
  className?: string;
}

/**
 * Legacy wrapper for HandTestingWidget.
 * Maps deckCards/deckId/compact/className to the shared component.
 * Use HandTestingWidget from @/components/mulligan/HandTestingWidget for new placements.
 */
export default function HandTestingWidget({
  deckCards,
  deckId,
  compact = false,
  className = "",
}: HandTestingWidgetProps) {
  return (
    <HandTestingWidgetShared
      mode="DECK"
      deckCards={deckCards}
      deckId={deckId}
      compact={compact}
      placement="DECK_PAGE"
      className={className}
    />
  );
}
