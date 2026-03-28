/**
 * Documents intentional differences between scryfall_cache PK normalization and price_cache keys.
 * Run: npx tsx tests/unit/cache-name-keys.test.ts
 */
import assert from "node:assert";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

/** Mirror of `normalizeName` in `app/api/price/route.ts`, `lib/ai/price-utils.ts`, shopping-list (not exported). */
function normalizePriceCacheKeyLikeRoutes(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019'`]/g, "'") // U+2019 + ASCII ' + ` — must stay in sync with those files
    .replace(/\s+/g, " ")
    .trim();
}

// Curly apostrophe (U+2019): price route folds to straight quote; scryfall_cache PK does not.
const curly = "Keruga\u2019s Format";
const sf = normalizeScryfallCacheName(curly);
const price = normalizePriceCacheKeyLikeRoutes(curly);
assert.notStrictEqual(sf, price, "expected apostrophe folding to diverge from scryfall PK norm");
assert.strictEqual(price.includes("\u2019"), false, "price key should not retain curly apostrophe");
assert.ok(sf.length > 0 && price.length > 0);

console.log("OK cache-name-keys");
