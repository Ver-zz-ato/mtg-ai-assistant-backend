export const FREE_DECK_LIMIT = 15;
export const FREE_COLLECTION_LIMIT = 10;
export const FREE_COLLECTION_CARD_LIMIT = 500;
export const FREE_WISHLIST_LIMIT = 10;
export const FREE_WISHLIST_CARD_LIMIT = 100;

export type ProStorageLimitCode =
  | "PRO_LIMIT_DECKS"
  | "PRO_LIMIT_COLLECTIONS"
  | "PRO_LIMIT_COLLECTION_SIZE"
  | "PRO_LIMIT_WISHLISTS"
  | "PRO_LIMIT_WISHLIST_SIZE";

export type ProStorageLimitError = {
  code: ProStorageLimitCode;
  message: string;
  limit: number;
};

export const PRO_STORAGE_LIMIT_MESSAGES: Record<ProStorageLimitCode, string> = {
  PRO_LIMIT_DECKS: "Free accounts can save up to 15 decks. Upgrade to Pro for unlimited decks.",
  PRO_LIMIT_COLLECTIONS: "Free accounts can save up to 10 collections. Upgrade to Pro for unlimited collections.",
  PRO_LIMIT_COLLECTION_SIZE:
    "Free collections can hold up to 500 cards. Upgrade to Pro for unlimited collection size.",
  PRO_LIMIT_WISHLISTS: "Free accounts can save up to 10 wishlists. Upgrade to Pro for unlimited wishlists.",
  PRO_LIMIT_WISHLIST_SIZE:
    "Free wishlists can hold up to 100 cards. Upgrade to Pro for unlimited wishlist size.",
};

export function buildProStorageLimitError(
  code: ProStorageLimitCode,
  limit = getLimitForCode(code),
): ProStorageLimitError {
  return { code, message: PRO_STORAGE_LIMIT_MESSAGES[code], limit };
}

function getLimitForCode(code: ProStorageLimitCode): number {
  switch (code) {
    case "PRO_LIMIT_DECKS":
      return FREE_DECK_LIMIT;
    case "PRO_LIMIT_COLLECTIONS":
      return FREE_COLLECTION_LIMIT;
    case "PRO_LIMIT_COLLECTION_SIZE":
      return FREE_COLLECTION_CARD_LIMIT;
    case "PRO_LIMIT_WISHLISTS":
      return FREE_WISHLIST_LIMIT;
    case "PRO_LIMIT_WISHLIST_SIZE":
      return FREE_WISHLIST_CARD_LIMIT;
  }
}

export function exceedsFreeCountLimit(currentCount: number, creatingCount: number, limit: number): boolean {
  return Math.max(0, currentCount) + Math.max(0, creatingCount) > limit;
}

export function exceedsFreeSizeLimit(currentQty: number, addedQty: number, limit: number): boolean {
  return Math.max(0, currentQty) + Math.max(0, addedQty) > limit;
}

export function wouldExceedCollectionLimit(params: {
  isPro: boolean;
  currentQty: number;
  importQty: number;
  importMode: "merge" | "overwrite";
  limit?: number;
}): boolean {
  if (params.isPro) return false;
  const limit = params.limit ?? FREE_COLLECTION_CARD_LIMIT;
  const baseQty = params.importMode === "overwrite" ? 0 : Math.max(0, params.currentQty);
  return exceedsFreeSizeLimit(baseQty, Math.max(0, params.importQty), limit);
}

/** How many card qty a free user can still add for this import mode. */
export function getFreeCollectionImportCapacity(
  currentQty: number,
  importMode: "merge" | "overwrite",
  limit = FREE_COLLECTION_CARD_LIMIT,
): number {
  return importMode === "overwrite"
    ? limit
    : Math.max(0, limit - Math.max(0, currentQty));
}

/** Trim import rows to fit the free collection size cap (preserves row order). */
export function trimCardsToFreeLimit<T extends { quantity: number }>(
  cards: T[],
  currentQty: number,
  importMode: "merge" | "overwrite",
  limit = FREE_COLLECTION_CARD_LIMIT,
): { cards: T[]; importedQty: number; skippedQty: number } {
  const capacity = getFreeCollectionImportCapacity(currentQty, importMode, limit);
  let used = 0;
  const trimmed: T[] = [];
  let skippedQty = 0;

  for (const card of cards) {
    const room = capacity - used;
    if (room <= 0) {
      skippedQty += Math.max(0, card.quantity);
      continue;
    }
    if (card.quantity <= room) {
      trimmed.push(card);
      used += card.quantity;
    } else {
      trimmed.push({ ...card, quantity: room });
      skippedQty += card.quantity - room;
      used = capacity;
    }
  }

  return { cards: trimmed, importedQty: used, skippedQty };
}
