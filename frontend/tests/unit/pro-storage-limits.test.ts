import {
  FREE_COLLECTION_CARD_LIMIT,
  FREE_COLLECTION_LIMIT,
  FREE_DECK_LIMIT,
  FREE_WISHLIST_CARD_LIMIT,
  FREE_WISHLIST_LIMIT,
  buildProStorageLimitError,
  exceedsFreeCountLimit,
  exceedsFreeSizeLimit,
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
assert(exceedsFreeSizeLimit(99, 1, FREE_WISHLIST_CARD_LIMIT) === false, "100th wishlist card should be allowed");
assert(exceedsFreeSizeLimit(100, 1, FREE_WISHLIST_CARD_LIMIT) === true, "101st wishlist card should be blocked");

const deckLimit = buildProStorageLimitError("PRO_LIMIT_DECKS");
assert(deckLimit.limit === 15, "Deck limit error should expose limit");
assert(deckLimit.message.includes("15 decks"), "Deck limit error should mention 15 decks");

console.log("pro-storage-limits tests passed");
