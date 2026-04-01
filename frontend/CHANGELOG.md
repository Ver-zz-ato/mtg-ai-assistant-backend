# Frontend changelog

## 2026-04-01

### Documentation — Supabase grant hardening (shared project)

- **`docs/SUPABASE_SCHEMA.md`:** New subsection **Database access — grant hardening** documenting production privilege changes on `ops_reports`, `seo_queries`, `deck_costs`, `seo_pages`, and tables intentionally deferred (`ai_test_*`, `api_usage_rate_limits`).
- **`docs/CURSOR_AGENT_HANDOVER.md`:** Database section updated to reference grant tightening vs RLS-only wording.

*Note: Privilege changes were applied in Supabase (not via this repo’s migration files in this pass).*

### Documentation — full `public` schema snapshot

- **`docs/SUPABASE_SCHEMA.md`:** Embedded `CREATE TABLE` list refreshed from a Supabase export (adds e.g. `app_changelog`, `remote_config`, expanded `ai_test_*` / `scryfall_cache` columns, `*_backup_20260328` staging tables). Short **Export note** clarifies `watchlists` vs `wishlists` and duplicate `wishlists` lines in some exports.

## 2026-03-31

### Admin — mobile scanner analytics (PostHog)

- **`/admin/app-scanner`:** Dashboard for mobile scanner events (`scan_card_*`, `scan_ai_*`): overview tiles, funnel-style counts, quality breakdowns (name resolution, match source, confirm method), AI Assist blocked/fallback/failures, auto-add vs canonical rates, and `will_persist_to_supabase` (new-deck vs persisted intent).
- **`GET /api/admin/scanner-analytics/overview`:** Server HogQL aggregates; uses `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` when set.
- **`lib/server/posthog-hogql.ts`:** Minimal HogQL client for admin reporting.
- **Nav:** Link under Admin → Mobile & Client Control (`JustForDavy`).
- **Docs:** `docs/ADMIN_SCANNER_DASHBOARD.md` (purpose + **REVERT** steps); `docs/MOBILE_ADMIN_CONTROL.md` table row for `/admin/app-scanner`.

### Cache key alignment (scryfall PK vs price key)

- **`app/api/deck/shopping-list/route.ts`:** `getCachedCardData` queries **`scryfall_cache.name`** with **`normalizeScryfallCacheName`** (not the price-style `normalizeName`). **`price_cache`** paths unchanged.
- **`lib/deck/deck-context-summary.ts`:** Fallback **`tally()`** looks up **`fetchCardsBatch`** rows with **`normalizeScryfallCacheName(name)`** instead of **`toLowerCase()`**. Deck hash / **`normalizeCardName`** hashing unchanged.

## 2026-03-30

### Deck editor — Maybe / Flex cards (non-Commander only)

- **Storage:** Optional **`decks.meta.maybeFlexCards`**: `Array<{ name: string; qty: number }>` (not in **`deck_cards`**). No migration; absent field loads as empty.
- **UI:** **`app/my-decks/[id]/CardsPane.tsx`** — collapsible **Maybe / Flex cards** section (helper copy) when format is set and not Commander; **`Main deck ·`** prefix on main card count. Add/remove/qty via **`EditorAddBar`** + row controls; **POST `/api/decks/maybe-flex`** persists (owner auth; **400** for Commander).
- **Helpers:** **`lib/deck/maybeFlexCards.ts`** — **`isMaybeFlexBucketEnabledForFormat`** (false if format missing/empty or Commander), normalize/merge helpers.
- **Analysis:** Unchanged — **DeckAnalyzerPanel** / **`/api/deck/analyze`** build **`deckText`** from **`deck_cards`** only; maybe/flex never included.
- **Follow-up (gating):** **`isMaybeFlexBucketEnabledForFormat`** / **`POST /api/decks/maybe-flex`** share the same gate: disabled for **empty format**, **`commander`**, **`edh`**, **`cedh`** (case-insensitive). Fixes mismatch where API could accept saves when the UI hid the section (e.g. unset format); **`edh`** / **`cedh`** labels now match Commander.
- **Polish:** **`Maybe / Flex: N cards`** qty total in **`CardsPane`** totals row (eligible decks). **Public** **`/decks/[id]`** — read-only **Maybe / Flex** block in **`PublicDeckCardList`** when meta has entries. **Copy decklist** + **Export CSV** append **`// Maybe / Flex cards`** via **`buildMaybeFlexPlaintextAppend`** (`lib/deck/maybeFlexCards.ts`).

### Collection page — card deck usage (badges, filter, detail)

- **Deck usage map:** Single GET **`/api/collections/deck-usage`** loads the signed-in user’s decks + **`deck_cards`**, aggregates to **`usageByKey`** (normalized keys, MDFC front-face fallback). Unsigned users get empty data (fail-open). **`lib/collection/deckCardUsage.ts`** holds **`getCardUsageKey`**, **`getDeckUsageForCard`**, and server aggregation helper.
- **`components/CollectionEditor.tsx` (page mode):** Row pill shows **deck count** when the card appears in ≥1 deck; **⋯** opens a detail modal. **Deck use** filter: All / In decks / Unused (enabled after usage load). Scryfall link + list behavior unchanged.
- **`components/CollectionCardDetailModal.tsx`:** Full-art modal with **In your decks** (**`<details>`**, collapsed by default); deck rows link to **`/my-decks/[id]`** with quantity.

### Collection deck usage — QA hardening (2026-03-30)

- **`lib/collection/deckCardUsage.ts`:** Unicode curly quotes folded before **`normalizeCardName`** for stabler name matching.
- **`app/api/collections/deck-usage/route.ts`:** **`deck_cards`** query uses **`.order('id')`** so **`.range`** pagination is deterministic.
- **`CollectionEditor.tsx`:** Clear usage map when refetching; **`deckUsageTrustworthy`** gates badges/filters/modal usages when **`loadError`** is set; refetch on **`authUser?.id`** change; reset modal/filter on session/collection change; **`loadHint`** on non-OK HTTP and fetch **catch** so **Unused** is not trusted without a valid response body.
- **`CollectionCardDetailModal.tsx`:** Optional **`detailsResetKey`**; **`Link`** **`onClose`** before navigate.

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
