# Scryfall cache — post-cleanup verification & writer audit

**Scope:** `mtg_ai_assistant` only. **Read-only:** this document does not run SQL or change data.

**Related:** canonical PK rules in `docs/SCRYFALL_CACHE_REBUILD_AUDIT.md`, implementation in `frontend/lib/server/scryfallCacheRow.ts` (`normalizeScryfallCacheName`, `buildScryfallCacheRowFromApiCard`).

**Health SQL:** `db/scryfall_cache_post_cleanup_health_counts.sql` (aggregate counts). Deeper samples: `db/scryfall_cache_health_audit.sql`.

---

## A) Post-cleanup verification checklist (operator)

Run in **staging first**, then production. Goal: confirm UI and APIs still resolve cards by **normalized oracle PK** after `scryfall_cache.name` cleanup.

### Card detail / commander surfaces

- [ ] Open a **legendary creature** deck with a known commander: commander portrait and title load; no blank image where cache had data before.
- [ ] Open **card detail** (or inline preview) for: a **DFC** (`//` in name), a **split card**, an **Adventure** if present in test deck.
- [ ] **Commander modal / picker**: search by full oracle name; confirm selection persists after save.

### Trending / discover

- [ ] **Trending / meta** surfaces that show commander or card art (e.g. home or meta pages): images load; no widespread `cache_miss`-style fallbacks in network tab for normal names.
- [ ] If the app uses **fuzzy** collection APIs, spot-check that results still match expectations (no mass “unknown” cards).

### Deck save / update / import

- [ ] **Save new deck** with 15–30 lines of plain decklist text; page loads without errors; card rows show types/images where applicable.
- [ ] **Update deck** text (change 2–3 lines); archetype/meta update path still runs without 500s.
- [ ] **Import** (if applicable): pasted list with MDFC lines using ` // ` matches **single** cache row per oracle name.

### Price / charts

- [ ] **Price** on deck or card surfaces: values appear or graceful empty state (not conflated with missing card identity).
- [ ] **Charts / history** (if tied to `price_cache`): spot-check one card; `price_cache.card_name` keys remain consistent with normalized names (see `bulk-price-import` note: apostrophe normalization differs from `scryfall_cache` — expect **near** match, not always identical).

### AI / meta-tag parity

- [ ] Run one **deck analysis** or **AI tool** that reads oracle text / types from cache: output quality unchanged vs pre-cleanup for the same decklist.
- [ ] **Health report** or **facts** endpoints that depend on `scryfall_cache`: no new systematic misses for valid English card names.

### Targeted name-shape tests

| Case | Example pattern | Check |
|------|-----------------|--------|
| **MDFC** | `Brightclimb Pathway // Grimclimb Pathway` | One PK; art and both type faces behave as before. |
| **Split** | `Wear // Tear` | Same. |
| **Alchemy** | Digital-only name if in test set | Loads if still in Scryfall bulk; otherwise expected miss, not wrong PK. |
| **Punctuation** | Names with `'` `,` `-` | Match `normalizeScryfallCacheName` (lowercase, NFKD); no duplicate rows for “same” card. |

**Pass criteria:** No regression in resolution rate for normal decklists; junk PKs stay **absent** after a few days of normal traffic (re-check health SQL).

---

## B) Cron / import safety audit — writers to `public.scryfall_cache`

**Convention (code):** Inserts/upserts should set **`name`** and **`name_norm`** to **`normalizeScryfallCacheName(top-level `card.name`)`** via `buildScryfallCacheRowFromApiCard` or `buildScryfallCachePartialImageRow`. **Never** use the raw HTTP request string, **`card_faces[0].name` alone**, or title case as PK.

**Vercel-scheduled crons** (`frontend/vercel.json`) **do not** include bulk Scryfall import or cache repair; those routes are **on-demand** (cron key / admin / external scheduler).

| File / route / job | Writes `scryfall_cache`? | PK source | `name_norm` source | Risk | Note |
|--------------------|---------------------------|-----------|--------------------|------|------|
| `frontend/lib/server/scryfallCacheRow.ts` | N/A (library) | `normalizeScryfallCacheName(card.name)` | Same as `name` in builder | **Safe** | Single source of truth for app writes. |
| `frontend/app/api/cron/bulk-scryfall/route.ts` | **Yes** (upsert) | `buildScryfallCacheRowFromApiCard` → top-level `card.name` | Same | **Safe** | Bulk `default_cards`; dedupe by normalized name per batch. Not in Vercel `crons` — manual / external trigger. |
| `frontend/app/api/bulk-jobs/scryfall-import/route.ts` | **Yes** | Same | Same | **Safe** | Mirrors bulk-scryfall; admin/cron key. |
| `frontend/app/api/cron/lightweight-scryfall/route.ts` | **Yes** | Same (`row.name` from builder) | Same | **Safe** | Search API sample; still uses top-level `card.name` from API. |
| `bulk-jobs-server/server.js` `/bulk-scryfall` | **Yes** | `norm(card.name)` (lockstep with TS) | Same | **Safe** | Separate deploy; keep `norm()` in sync with `scryfallCacheRow.ts`. |
| `frontend/app/api/cron/bulk-price-import/route.ts` | **No** | — | — | **Safe** | Reads `scryfall_cache.name`; writes **`price_cache`** only (`norm()` for price keys — intentionally not identical to cache PK). |
| `frontend/app/api/cron/daily-price-update/route.ts` | **No** | — | — | **Safe** | Reads cache names; updates **`price_cache`**. |
| `frontend/app/api/cron/scryfall-cache-incomplete-repair/route.ts` | **Yes** (merge upsert) | Existing DB `name` must equal `normalizeScryfallCacheName(api card.name)` | Set in merge to match PK | **Review** | Does **not** invent new PKs; skips merge if API name ≠ PK. Junk PKs remain until manual cleanup. |
| `frontend/app/api/cron/scryfall-cache-phase3-backfill/route.ts` | **Yes** (merge upsert) | Same merge rules | Same | **Review** | Same as incomplete repair. |
| `frontend/lib/server/scryfallCache.ts` `getImagesForNamesCached` | **Yes** (partial image rows) | `buildScryfallCachePartialImageRow(normalizeScryfallCacheName(canonical))` | Same as `name` | **Safe** | Upserts use **resolved** oracle name from API, not request key (`lib/scryfall.ts` Phase 2B). |
| `frontend/lib/server/scryfallCache.ts` `getDetailsForNamesCached` | **Yes** | `buildScryfallCacheRowFromApiCard` only when `lookupKey === normalizeScryfallCacheName(api card.name)` | Same | **Safe** | **Skips upsert** if request resolved to a card whose `card.name` does not match lookup key — avoids request-key pollution. |
| `frontend/lib/server/scryfallCache.ts` `getEnrichmentForNames` | **Yes** | Same guard as `getDetailsForNamesCached` | Same | **Safe** | Same skip-when-mismatch behavior. |
| `frontend/lib/deck/inference.ts` `fetchCard` / `fetchCardsBatch` | **Yes** | `buildScryfallCacheRowFromApiCard` | Same | **Safe** | API returns full card; PK from top-level `name`. |
| `frontend/app/api/decks/save/route.ts` | **Yes** | `buildScryfallCacheRowFromApiCard` from `/cards/collection` | Same | **Safe** | Collection returns canonical `card.name`. |
| `frontend/app/api/decks/update/route.ts` | **Yes** | Same | Same | **Safe** | Same pattern as save. |
| `frontend/app/api/decks/recompute-archetypes/route.ts` | **Yes** | Same | Same | **Safe** | Same builder. |
| `frontend/app/decks/[id]/page.tsx` (server `scryfallBatch`) | **Yes** | `buildScryfallCacheRowFromApiCard` | Same | **Safe** | Local `norm()` for **reads** matches cache key shape; writes go through builder only. |
| `frontend/app/api/admin/scryfall-cache/route.ts` | **Delete** (manual) | — | — | **Review** | Admin can delete by PK; does not create junk. |
| `frontend/app/api/admin/data/optimize-scryfall-cache/route.ts` | **Update** (oracle text / images) | Unchanged | Unchanged | **Review** | Mutates content columns; **not** intended to change `name`. |
| `frontend/scripts/*.mjs` (preview SQL generators) | **No** | — | — | **Safe** | Emit SQL files only; no runtime DB writes from Vercel app. |

**Summary:** No automated path reviewed here **sets** `scryfall_cache.name` from a raw decklist token, bracket markup, CSV fragment, or face-only name **as long as** callers use `buildScryfallCacheRowFromApiCard` / partial image helpers. **Merge** routes only **refresh** existing rows whose PK already matches Scryfall’s top-level `card.name` after normalization. Re-pollution risk is therefore **low** from application code; residual junk requires **manual/SQL** cleanup or one-off bad data from historical bugs.

---

## After deployment

1. Run `db/scryfall_cache_post_cleanup_health_counts.sql` in Supabase SQL editor (read-only).
2. Optionally sample rows from `db/scryfall_cache_health_audit.sql` sections 2–5.
3. Repeat health counts after **7 days** of cron/user traffic to confirm junk counters stay flat or decrease.
