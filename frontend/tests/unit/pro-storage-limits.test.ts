import {
  FREE_COLLECTION_CARD_LIMIT,
  FREE_COLLECTION_LIMIT,
  FREE_DECK_LIMIT,
  FREE_WISHLIST_CARD_LIMIT,
  FREE_WISHLIST_LIMIT,
  buildProStorageLimitError,
  exceedsFreeCountLimit,
  exceedsFreeSizeLimit,
  wouldExceedCollectionLimit,
  trimCardsToFreeLimit,
  getFreeCollectionImportCapacity,
} from "../../lib/pro-storage-limits";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(FREE_DECK_LIMIT === 15, "Free deck limit should be 15");
assert(FREE_COLLECTION_LIMIT === 10, "Free collection limit should be 10");
assert(FREE_COLLECTION_CARD_LIMIT === 500, "Free collection size limit should be 500");
assert(FREE_WISHLIST_LIMIT === 10, "Free wishlist limit should be 10");
assert(FREE_WISHLIST_CARD_LIMIT === 100, "Free wishlist size limit should be 100");

assert(exceedsFreeCountLimit(14, 1, FREE_DECK_LIMIT) === false, "15th deck should be allowed");
assert(exceedsFreeCountLimit(15, 1, FREE_DECK_LIMIT) === true, "16th deck should be blocked");
assert(exceedsFreeCountLimit(20, 1, FREE_DECK_LIMIT) === true, "Existing over-limit users cannot grow");

assert(exceedsFreeSizeLimit(499, 1, FREE_COLLECTION_CARD_LIMIT) === false, "500th collection card should be allowed");
assert(exceedsFreeSizeLimit(500, 1, FREE_COLLECTION_CARD_LIMIT) === true, "501st collection card should be blocked");

assert(
  wouldExceedCollectionLimit({ isPro: false, currentQty: 0, importQty: 702, importMode: "merge" }) === true,
  "702-card merge into empty free collection should be blocked",
);
assert(
  wouldExceedCollectionLimit({ isPro: false, currentQty: 0, importQty: 702, importMode: "overwrite" }) === true,
  "702-card overwrite on free collection should be blocked",
);
assert(
  wouldExceedCollectionLimit({ isPro: true, currentQty: 0, importQty: 702, importMode: "merge" }) === false,
  "Pro users should not be blocked by collection size",
);

assert(
  getFreeCollectionImportCapacity(0, "overwrite") === FREE_COLLECTION_CARD_LIMIT,
  "Overwrite on empty collection should allow full free capacity",
);
const trimmed = trimCardsToFreeLimit(
  [
    { quantity: 300 },
    { quantity: 250 },
    { quantity: 100 },
  ],
  0,
  "overwrite",
);
assert(trimmed.importedQty === 500, "Trim should cap total imported qty at 500");
assert(trimmed.skippedQty === 150, "Trim should report skipped qty beyond cap");
assert(trimmed.cards.length === 2, "Trim should keep first full rows plus partial last row");
assert(trimmed.cards[1].quantity === 200, "Last included row should be partial qty");
assert(exceedsFreeSizeLimit(99, 1, FREE_WISHLIST_CARD_LIMIT) === false, "100th wishlist card should be allowed");
assert(exceedsFreeSizeLimit(100, 1, FREE_WISHLIST_CARD_LIMIT) === true, "101st wishlist card should be blocked");

const deckLimit = buildProStorageLimitError("PRO_LIMIT_DECKS");
assert(deckLimit.limit === 15, "Deck limit error should expose limit");
assert(deckLimit.message.includes("15 decks"), "Deck limit error should mention 15 decks");

console.log("pro-storage-limits tests passed");
