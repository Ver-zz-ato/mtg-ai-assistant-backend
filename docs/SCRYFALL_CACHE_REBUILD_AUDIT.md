# `scryfall_cache` full rebuild — safety audit

**Scope:** `mtg_ai_assistant` / `frontend` code paths and live `public.scryfall_cache` DDL.  
**Audit date:** 2026-03-28 (session).  
**Audit only — no code or DB changes implied.**

**Canonical PK rule (for rebuild):**  
`name` = `normalizeScryfallCacheName(card.name)` as implemented in `frontend/lib/server/scryfallCacheRow.ts` (lowercase, NFKD, strip combining marks, collapse whitespace, trim).

---

## 1. Column inventory (live schema) and classification

Reference DDL (Supabase):

```sql
CREATE TABLE public.scryfall_cache (
  name text NOT NULL,
  small text,
  normal text,
  art_crop text,
  updated_at timestamp with time zone DEFAULT now(),
  type_line text,
  oracle_text text,
  color_identity ARRAY,
  rarity text,
  set text,
  collector_number text,
  mana_cost text,
  cmc integer DEFAULT 0,
  legalities jsonb,
  name_norm text,
  colors ARRAY,
  keywords ARRAY,
  power text,
  toughness text,
  loyalty text,
  is_land boolean,
  is_creature boolean,
  is_instant boolean,
  is_sorcery boolean,
  is_enchantment boolean,
  is_artifact boolean,
  is_planeswalker boolean,
  CONSTRAINT scryfall_cache_pkey PRIMARY KEY (name)
);
```

**Writer of record:** `buildScryfallCacheRowFromApiCard` → `buildScryfallCacheRowCore` in `frontend/lib/server/scryfallCacheRow.ts` (plus `mergeScryfallCacheRowFromApiCard` for Phase 3 backfill, and `buildScryfallCachePartialImageRow` for image-only rows).

### Classification key

- **RAW_FROM_SCRYFALL** — taken from Scryfall JSON (possibly with face merge).
- **DERIVED_FROM_SCRYFALL_IN_CODE** — computed in app from API card / type line.
- **DERIVED_FROM_OTHER_DB_LOGIC** — not used for normal writes (no separate DB triggers assumed).
- **UNKNOWN / MANUAL / LEGACY** — bad rows or admin-damaged data.

| Column | Classification | Notes |
|--------|----------------|--------|
| `name` | **DERIVED_FROM_SCRYFALL_IN_CODE** | PK = `normalizeScryfallCacheName(String(card.name))`, not raw Scryfall string. |
| `name_norm` | **DERIVED_FROM_SCRYFALL_IN_CODE** | Set to same value as `name` in builder; intended to mirror PK. |
| `small`, `normal`, `art_crop` | **RAW_FROM_SCRYFALL** (with face merge) | `image_uris` or `card_faces[0].image_uris`. |
| `type_line` | **RAW_FROM_SCRYFALL** | Top-level `type_line`. |
| `oracle_text` | **RAW_FROM_SCRYFALL** (with face merge) | Top-level or `card_faces[0]`; can be **MANUAL** if admin oracle truncation ran. |
| `mana_cost` | **RAW_FROM_SCRYFALL** (with face merge) | |
| `cmc` | **RAW_FROM_SCRYFALL** | `cmc` / `mana_value`, rounded. |
| `color_identity` | **RAW_FROM_SCRYFALL** | Array from Scryfall. |
| `colors` | **RAW_FROM_SCRYFALL** | `card.colors` (may be null). |
| `keywords` | **RAW_FROM_SCRYFALL** | `card.keywords` (may be null). |
| `power`, `toughness`, `loyalty` | **RAW_FROM_SCRYFALL** (with face merge) | |
| `legalities` | **RAW_FROM_SCRYFALL** | jsonb from `card.legalities` (string values only in upsert). |
| `rarity` | **DERIVED_FROM_SCRYFALL_IN_CODE** | Lowercased in builder. |
| `set` | **DERIVED_FROM_SCRYFALL_IN_CODE** | Uppercased set code. |
| `collector_number` | **RAW_FROM_SCRYFALL** | Trimmed string. |
| `is_land` … `is_planeswalker` | **DERIVED_FROM_SCRYFALL_IN_CODE** | `deriveTypeFlagsFromTypeLine(type_line)` — regex on type line, not Scryfall booleans. |
| `updated_at` | **DERIVED_FROM_SCRYFALL_IN_CODE** | Set on write in builder. |

**No separate “tag” columns** exist on `scryfall_cache` in this schema. Deck/commander “tags” in the product sense mostly come from **application logic** (oracle text, type line, role heuristics), not extra DB columns.

**`UNKNOWN / MANUAL / LEGACY`:** Any row whose `name` is not exactly `normalizeScryfallCacheName` of a current Scryfall `card.name` (historic junk, bad imports, manual SQL).

**Not a column:** `layout` — used on live API refresh in `getEnrichmentForNames` but **not** persisted by `buildScryfallCacheRowFromApiCard`.

---

## 2. Website/app features that read `scryfall_cache`

Many routes only need **`name`** (existence / `ilike` / fuzzy).

| Area | Location / mechanism | Fields / needs |
|------|----------------------|----------------|
| Deck inference / analyze / chat | `lib/deck/inference.ts` (`SC_CACHE_INFERENCE_SELECT`), `fetchCard` / `fetchCardsBatch` | Raw: `type_line`, `oracle_text`, `color_identity`, `cmc`, `mana_cost`, `legalities`, `keywords`, `colors`, P/T/L. Derived: `is_*` booleans. |
| Deck enrichment & health-style facts | `lib/server/scryfallCache.ts` `getEnrichmentForNames`, `lib/deck/deck-enrichment.ts` | Same family; `layout` only on API refresh, not from DB. |
| Batch metadata (UI) | `app/api/cards/batch-metadata/route.ts` | Wide select: images, `legalities`, `keywords`, `colors`, all `is_*`, etc. |
| Images | `getImagesForNamesCached`, `batch-images`, OG images, recommendations | `small`, `normal`, `art_crop`; some paths `ilike` on `name`. |
| Recommendations | `app/api/recommendations/deck/[id]/route.ts` | Details + CI; `legalities` for non-Commander; images from cache; **prices from `price_cache`**. |
| Shopping list | `app/api/deck/shopping-list/route.ts` | `type_line`, `oracle_text`, `set`, `collector_number`, `updated_at`. |
| Semantic fingerprint | `lib/ai/deck-semantic-fingerprint.ts` via `getDetailsForNamesCacheOnly` | `type_line`, `oracle_text`, `keywords`, `is_instant`, `is_sorcery` (fail-open). |
| Mulligan / tools | `lib/mulligan/card-types.ts`, probability page | `type_line`, `is_land`, images as applicable. |
| Fuzzy / fix names | `fix-names`, `parse-and-fix-names`, `normalizeCardNames`, `fuzzy`, collections/decks | Mostly **`name`**. |
| Cron bulk price import | `app/api/cron/bulk-price-import/route.ts` | **Reads** all `name` from `scryfall_cache`; writes **`price_cache`** — see §5. |
| Admin optimize | `app/api/admin/data/optimize-scryfall-cache/route.ts` | Can **UPDATE** `oracle_text` (truncation). |
| Budget swaps | Cron updates **`app_config.budget_swaps`** — not a direct reader of `scryfall_cache` for the map. |

**Related table:** `public.card_embeddings` (`card_name`, etc.) is **not** `scryfall_cache`. A cache rebuild does not refresh embeddings; plan a separate job if features depend on it.

---

## 3. Rebuild readiness

### Full reload via `buildScryfallCacheRowFromApiCard` (same as bulk import / `default_cards`)

**Comes back automatically:**

- All columns the builder sets, including `name` / `name_norm`, images, rules text, `legalities`, `colors` / `keywords`, P/T/L, `is_*`, `rarity` / `set` / `collector_number`, `cmc` / `mana_cost`, `updated_at`.

### Missing only if rebuild is incomplete

- Image-only partial upserts without full row — text/flags missing until full upsert.

### Degrades with empty/partial table during cutover

- Features needing `legalities`, `oracle_text`, `type_line`, `is_*`, or images until rows exist.
- Semantic fingerprint — weaker; fail-open.
- Bulk price import — scans `scryfall_cache.name`; empty cache ⇒ no price updates until repopulated.

### Not stored in `scryfall_cache`

- `layout` on enrichment — from live Scryfall API on refresh paths only.

---

## 4. Metadata / tag upgrade audit

| Mechanism | Where | Stored only in `scryfall_cache`? | Deterministic after rebuild? |
|-----------|--------|----------------------------------|------------------------------|
| Phase 2A-style columns | `db/migrations/039_*`, `buildScryfallCacheRowFromApiCard` | Yes | **Yes** — same JSON + same code. |
| Phase 3 backfill | `mergeScryfallCacheRowFromApiCard`, `scryfall-cache-phase3-backfill` | Merges into rows | **Yes** when PK matches API name. |
| Type flags | `deriveTypeFlagsFromTypeLine` | Yes | **Yes** from `type_line`. |
| Deck role / heuristics in prompts | TS from oracle + flags | Not extra columns | **Yes** if oracle/type/`is_*`/`keywords` present. |
| Admin oracle truncation | `optimize-scryfall-cache` | Damages `oracle_text` | **Not** reproducible until re-fetch from Scryfall. |

---

## 5. Price compatibility audit

**`price_cache` (live):**

```sql
card_name text NOT NULL UNIQUE,
```

- **`price_cache.card_name`** is the price key. Bulk price import **reads** `scryfall_cache.name` and upserts **`price_cache`** with normalized `card_name` (route uses its own `norm()` — NFKD family; may differ slightly from `normalizeScryfallCacheName` on apostrophes).

- Price flows do **not** require `scryfall_cache` image or oracle columns — only a **consistent naming key** between cache listing and price storage/lookup.

- **Rebuilding `scryfall_cache` alone** does not break prices if **`name` stays stable** and you **re-run** bulk price import after repopulation. If `scryfall_cache` is **empty**, the job that lists names from it updates **no** prices until the cache is filled again (ordering issue; no FK between tables).

---

## 6. Safe rebuild recommendation

**`SAFE TO REBUILD WITH POST-REBUILD ENRICHMENT` (operational sequencing)** — not because the schema needs a separate enrichment *algorithm* beyond the standard builder.

- Full reload with **`buildScryfallCacheRowFromApiCard`** already includes derived `is_*` and `name_norm`.
- Plan **job order**: repopulate `scryfall_cache` before jobs that scan it (bulk price import).
- Optional: Phase 3 cron if you still rely on merge semantics for partial rows.
- **`card_embeddings`**: separate backfill if used.

---

## 7. Suggested sequence

1. Avoid admin `oracle_text` truncation during migration (or re-fetch after).
2. Rebuild `scryfall_cache` using production-equivalent bulk import (`buildScryfallCacheRowFromApiCard` / `POST /api/cron/bulk-scryfall` or equivalent).
3. Optional: `POST /api/cron/scryfall-cache-phase3-backfill` (or `run-phase3-backfill-loop.mjs`) for merge-fill edge cases.
4. Run bulk price import so `price_cache` aligns with repopulated names.
5. Validate: `batch-metadata`, deck analyze, recommendations, shopping-list (`set` + `collector_number`).
6. If using **`card_embeddings`**: separate embedding backfill.
7. Cut over (swap table or point traffic).

---

## Bottom line

With the live column list, material data is **Scryfall-sourced or deterministically derived in app code**. Rebuild safety hinges on **PK stability** (`normalizeScryfallCacheName`), **using the full builder** (not image-only rows for primary data), and **job order** with `price_cache` and embeddings — not on hidden tag columns on `scryfall_cache`.

---

## Operational hardening (2026-03-28)

- **Single PK rule:** `normalizeScryfallCacheName(top-level card.name)` only; `buildScryfallCacheRowFromApiCard` returns `null` when `card.name` is empty (no upsert).
- **Merge / Phase 3:** `mergeScryfallCacheRowFromApiCard` logs when DB PK ≠ normalized API `card.name` (includes `set`, `collector_number`, optional `route`).
- **Collection refresh:** `getDetailsForNamesCached` / `getEnrichmentForNames` skip cache upserts when the normalized request lookup key ≠ normalized API `card.name` (structured warning).
- **Lockstep:** `bulk-jobs-server/server.js` mirrors the same normalization; `bulk-price-import` keeps a **separate** `norm()` (apostrophe folding) for `price_cache` keys — documented in code, not used for `scryfall_cache` PK.
- **Health checks:** `db/scryfall_cache_health_audit.sql` (SQL editor); read-only `GET /api/admin/data/scryfall-cache-health` (counts + pointer to SQL).
- **Incomplete repair:** `POST /api/cron/scryfall-cache-incomplete-repair` — batches incomplete rows (null `type_line` / `oracle_text` / both images), `/cards/collection` + `mergeScryfallCacheRowFromApiCard`. See `db/SCRYFALL_CACHE_INCOMPLETE_REPAIR.md`.
- **Legacy lightweight importers** (`lightweight-scryfall`, `bulk-jobs/scryfall-import`) use `buildScryfallCacheRowFromApiCard` for full rows (same PK and field population as bulk cron); dedupe by `row.name`.

## References (code)

- `frontend/lib/server/scryfallCacheRow.ts` — `buildScryfallCacheRowFromApiCard`, `deriveTypeFlagsFromTypeLine`, `mergeScryfallCacheRowFromApiCard`
- `frontend/lib/server/scryfallCache.ts` — `getEnrichmentForNames`, `getDetailsForNamesCached`, `getDetailsForNamesCacheOnly`
- `frontend/lib/deck/inference.ts` — `SC_CACHE_INFERENCE_SELECT`, `fetchCard` / `fetchCardsBatch`
- `frontend/app/api/cards/batch-metadata/route.ts`
- `frontend/app/api/cron/bulk-scryfall/route.ts`, `bulk-price-import/route.ts`
- `frontend/app/api/admin/data/optimize-scryfall-cache/route.ts`
- `db/scryfall_cache_health_audit.sql`, `frontend/app/api/admin/data/scryfall-cache-health/route.ts`
- `db/SCRYFALL_CACHE_INCOMPLETE_REPAIR.md`, `frontend/app/api/cron/scryfall-cache-incomplete-repair/route.ts`
