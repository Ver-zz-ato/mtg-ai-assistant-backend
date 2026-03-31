# Implementation reference (website / `frontend`)

Brief pointers for API ↔ DB contracts. For full product docs, see repo `docs/` and feature-specific files.

## Name keys vs display labels

**Lookup key is not the same as display label.** Three concepts:

| Kind | Role | Typical helper |
|------|------|----------------|
| **Scryfall / oracle cache PK** | `scryfall_cache.name`, in-memory maps keyed like the DB (`byName` in deck inference, image cache writes) | `normalizeScryfallCacheName` — `lib/server/scryfallCacheRow.ts` (NFKD, strip combining marks; **no** apostrophe folding to ASCII `'`). Top-level `card.name` only for MDFCs, not a single face name. |
| **Price row key** | `price_cache.card_name` | Same steps as `/api/price` / `lib/ai/price-utils` (includes folding `’` / `` ` `` / `'` to ASCII `'`). Intentionally not identical to the scryfall PK string in some edge cases. |
| **Display / alias** | User-facing or parser-resolved card string from alias files | `canonicalize()` in `lib/cards/canonicalize.ts` — **not** a DB lookup key. |

## Deck role tagging (`lib/deck/card-role-tags.ts`)

- **Primary signals:** Oracle regex and type-line / mana heuristics (named sources: `oracle_regex`, `type_line`, `heuristic`, etc.).
- **Supplemental:** When `EnrichedCard.keywords` is present (from `scryfall_cache` / API), a small additive pass may attach low-confidence tags with source `keywords` — e.g. **Landfall** → `payoff`, **Flashback** / **Disturb** / … → `graveyard_setup`, **Populate** → `token_payoff`, **Fabricate** → `token_producer`, only if the main rules did not already assign that role. Keywords are **not** the sole source of truth for roles.

## Maybe / Flex cards (non-Commander decks)

- **Purpose:** Optional consideration list — **not** main deck, **not** counted in main totals, **not** in **`deck_cards`**.
- **Storage:** `decks.meta.maybeFlexCards` — `Array<{ name: string; qty: number }>` (max 80 entries, qty 1–99). **Backward compatible** if absent.
- **UI gating:** Shown only when `isMaybeFlexBucketEnabledForFormat(format)` is true: non-empty format and **not** commander-like — **`commander`**, **`edh`**, or **`cedh`** (trim + lowercase). **Hidden** when format is missing/empty (safest default). **`POST /api/decks/maybe-flex`** uses the same helper.
- **API:** **`POST /api/decks/maybe-flex`** — body `{ deckId, cards }`; updates **`meta`**; rejects Commander decks.
- **Public + export:** **`PublicDeckCardList`** optional **`maybeFlexCards`** (read-only). **`CopyDecklistButton`** / **`ExportDeckCSV`** append **`buildMaybeFlexPlaintextAppend(format, meta.maybeFlexCards)`** after the main list (same format gate).
- **Deck analyze / LLM:** Payloads built from **`deck_cards`** / **`deck_text`** only — maybe/flex cards are **excluded** unless explicitly merged elsewhere (they are not).

## Pricing

- **`GET/POST /api/price`** — `price_cache` keys: `card_name` (normalized with apostrophe folding per route helper), `usd_price`, `eur_price`. GBP is derived for responses, not stored.
- **`POST /api/deck/shopping-list`** — Uses the same `price_cache` columns and `normalizeName` semantics as `/api/price` for cache hits and upserts after Scryfall fetches. This normalization is for **price rows**, not `scryfall_cache.name` (canonical oracle PK uses `normalizeScryfallCacheName` in `lib/server/scryfallCacheRow.ts`).

## Admin scanner analytics (mobile / PostHog)

- **UI:** `/admin/app-scanner` — scanner funnel, quality breakdowns, AI Assist, auto-add / persist labeling.
- **API:** `GET /api/admin/scanner-analytics/overview?days=7` — HogQL aggregates; requires `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`.
- **Helper:** `lib/server/posthog-hogql.ts` — shared Query API client (same env pattern as `scripts/audit-phase2/posthog-events.ts`).
- **Doc:** `docs/ADMIN_SCANNER_DASHBOARD.md` (includes a **REVERT** checklist).
