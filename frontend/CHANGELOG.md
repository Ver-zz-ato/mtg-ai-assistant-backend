# Frontend changelog

## 2026-03-28

### Meta cron — trending cards (trend delta, filters)

- **`app/api/cron/meta-signals/route.ts`:** **`trending-cards`** now uses **unique deck incidence** (not row counts), **trend_score = (recent_count/recent_total) − (prev_count/prev_total)** (recent = last 30d activity; previous = 30–60d ago via `created_at` and `updated_at` sub-windows, deduped). Excludes **`scryfall_cache`** lands (`is_land` or **`type_line`** word **`Land`** via `\bLand\b` — not substring `land`, which wrongly matched **Island**), **staple denylist**, cards in **>40%** of a **1000-deck** sample, and **<5** recent decks. Still **30** rows. **most-played-cards** unchanged.
- **`lib/meta/trendingCardsCompute.ts`:** Pure scoring + constants; **`isLandFromCacheRow`** fix (above).
- **`tests/unit/trending-cards-compute.test.ts`:** Assert-style unit checks.

### Vercel cost — polling, middleware, ingest matcher

- **`lib/active-users-context.tsx`:** **`/api/stats/activity`** poll **120s** (was 60s); **no poll while tab hidden**; **visibility** refetch when stale (~90s); **in-flight** dedupe.
- **`components/RateLimitIndicator.tsx`:** Pro **`/api/rate-limit/status`** poll **120s** (was 30s); same **visibility** + **dedupe**; **`hasWarned`** moved to **ref** so toasts don’t reset the interval.
- **`middleware.ts`:** After a **maintenance off** config read, **skip** internal **`/api/config?key=maintenance`** fetch for **12s** (emergency: **`MAINTENANCE_HARD_READONLY`**); matcher excludes **`/ingest/*`** (analytics proxy — no session/maintenance work).

### Deck role tagging — supplemental Scryfall `keywords`

- **`lib/deck/card-role-tags.ts`:** After existing oracle/heuristic rules, optional additive tags from `EnrichedCard.keywords` (source `keywords`, lower confidence): Landfall → `payoff` (nonlands only); subset of graveyard keyword actions → `graveyard_setup`; Populate → `token_payoff`; Fabricate → `token_producer`. Skipped when that role was already assigned.
- **`tests/unit/card-role-tags-keyword.test.ts`:** Covers the new additive paths only.
- **`docs/IMPLEMENTATION_REFERENCE.md`:** Short note on primary vs keyword-supplemental tagging.

### Docs / guardrails — cache keys vs price keys vs display names

- **`docs/IMPLEMENTATION_REFERENCE.md`:** Short table: scryfall PK (`normalizeScryfallCacheName`), `price_cache` key (`/api/price`), `canonicalize()` (display/alias).
- **Inline comments:** `lib/deck/inference.ts` (`norm`), `app/api/price/route.ts`, `lib/ai/price-utils.ts`, `lib/cards/canonicalize.ts` — clarify which normalizer applies where.
- **`tests/unit/cache-name-keys.test.ts`:** Asserts `normalizeScryfallCacheName` and price-route-style normalization diverge on U+2019 apostrophe (documented intentional difference).

### Deck inference — `byName` map key normalization

- **`lib/deck/inference.ts`:** All `byName` lookups and updates use the same canonical name helper as batch/card fetch (`normalizeScryfallCacheName` / `norm`) instead of `toLowerCase()`, so deck lines match cache keys (accents, Unicode normalization).
- **`tests/unit/inference-byName-key.test.ts`:** Asserts `tagCardRoles` resolves a deck line when the map is keyed by normalized name.

### Deck shopping list — `price_cache` schema alignment

- **`app/api/deck/shopping-list/route.ts`:** Reads/writes `price_cache` using `card_name`, `usd_price`, `eur_price`, and `onConflict: 'card_name'` (matches `app/api/price/route.ts` and bulk import). GBP for cached rows is derived from USD via the same FX pattern as the price route; no `gbp_price` column.
