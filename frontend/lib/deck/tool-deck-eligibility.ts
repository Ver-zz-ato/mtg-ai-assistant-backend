import { countAiWorkshopDeckCards } from "./ai-workshop-deck-text";
import { getAiDeckHalfwayMinimumCards, getTargetCountForFormat, isAiDeckBelowHalfway } from "./ai-workshop-rules";

export { getAiDeckHalfwayMinimumCards, isAiDeckBelowHalfway };

/** Saved deck row with enough data to filter tool pickers (matches mobile halfway rules). */
export type SavedDeckPickerRow = {
  id: string;
  title: string;
  format: string;
  commander: string | null;
  deckText: string;
  cardCount: number;
};

export function isSavedDeckEligibleForTools(cardCount: number, format: string): boolean {
  return cardCount > 0 && !isAiDeckBelowHalfway(cardCount, format);
}

export function getSavedDeckTargetCount(format: string): number {
  return getTargetCountForFormat(format);
}

export function enrichSavedDeckRow(row: {
  id: string;
  title?: string | null;
  format?: string | null;
  commander?: string | null;
  deck_text?: string | null;
}): SavedDeckPickerRow | null {
  const deckText = String(row.deck_text || "").trim();
  if (!deckText) return null;
  const format = String(row.format || "Commander").trim() || "Commander";
  const cardCount = countAiWorkshopDeckCards(deckText, format);
  return {
    id: row.id,
    title: row.title?.trim() || "Untitled deck",
    format,
    commander: row.commander?.trim() || null,
    deckText,
    cardCount,
  };
}

export function filterEligibleSavedDecks(rows: SavedDeckPickerRow[]): {
  eligible: SavedDeckPickerRow[];
  hiddenCount: number;
} {
  const eligible: SavedDeckPickerRow[] = [];
  let hiddenCount = 0;
  for (const row of rows) {
    if (isSavedDeckEligibleForTools(row.cardCount, row.format)) {
      eligible.push(row);
    } else if (row.cardCount > 0) {
      hiddenCount += 1;
    }
  }
  return { eligible, hiddenCount };
}
