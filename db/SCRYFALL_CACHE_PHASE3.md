# Phase 3 — `public.scryfall_cache` backfill (Phase 2A fields + legalities)

## Goal

Populate Phase 2A columns (`name_norm`, `colors`, `keywords`, `power`, `toughness`, `loyalty`, type flags) and improve `legalities` where missing, using the **same** mapping as live writers: `buildScryfallCacheRowFromApiCard` + **merge** rules so existing non-null data is not replaced by nulls.

**Readers are unchanged** in this phase.

## Source of truth

1. **Primary:** Scryfall **`/cards/collection`** for batches of up to 75 names (existing PKs in `scryfall_cache`).
2. **Mapping:** `mergeScryfallCacheRowFromApiCard` in `frontend/lib/server/scryfallCacheRow.ts` (calls `buildScryfallCacheRowFromApiCard` internally, then preserves existing values when API fields are empty).
3. **Bulk default_cards** (`/api/cron/bulk-scryfall`) remains the path for **full** oracle coverage; Phase 3 fills **gaps** for rows already in the table (e.g. image-only or partial TTL rows).

## Mechanism

| Item | Detail |
|------|--------|
| **Route** | `POST /api/cron/scryfall-cache-phase3-backfill` |
| **Auth** | Same as other crons: `x-cron-key` / `?key=` / Vercel cron / signed-in admin |
| **Client** | Service role via `getAdmin()` |
| **Batch** | Up to 75 names per request; scans pages of 200 rows until enough **candidates** or `maxPages` |
| **Query params** | `batchSize` (default 75, max 75), `maxPages` (default 15, max 50), `after` (exact PK string; next request uses `name` **>** `after` in text sort) |
| **Resumable** | Yes: use `nextAfter` as `?after=` — it is the **last row examined** in the scan (not necessarily “canonical”; brackets/punctuation are literal DB `name`). |
| **Safety** | Skips merge when `normalizeScryfallCacheName(card.name) !== row.name` (PK mismatch / junk row) |

## Candidate selection (`needsPhase3Backfill`)

A row is a candidate if any of:

- `name_norm` missing
- `legalities` null
- `type_line` present but **all** type flags null
- Images present but `type_line` null and all type flags null
- `type_line` present but `colors` or `keywords` null (fill from API; colorless uses `[]`)

## Local batch loop (`run-phase3-backfill-loop.mjs`)

Optional helper in **`frontend/run-phase3-backfill-loop.mjs`**: calls the cron repeatedly with `nextAfter` until **completion** or a stop rule.

- **`message: no_rows_needing_backfill_in_scan_range`:** if **`nextAfter` equals the request cursor**, the scan did not advance (typically **end of table** or nothing left to do) → **stop**. If **`nextAfter` differs**, the window had no candidates but the cursor **advanced** → **continue** (do not treat as global “done” mid-table).
- **`merged = 0` for 5 consecutive rounds** only counts when **`candidates > 0`** (had rows to merge but none merged).
- **Safety:** `MAX_ROUNDS` default **10,000,000** (practical infinity). Update the script’s starting `after` to the latest `nextAfter` when resuming.

## Verification

Run **`db/scryfall_cache_phase3_verification.sql`** (read-only).

**Post-run checks (typical):**

- `name_norm_set` approaches `total_rows` (migration 039 may already set many).
- `has_legalities` increases for rows previously image-only.
- `rows_with_any_type_flag` increases where `type_line` was present but flags were null.

## Phase 4 (future)

Adopt new fields in readers (mobile/website) once verification shows stable coverage; no reader changes in Phase 3.

## Files

| File | Role |
|------|------|
| `frontend/lib/server/scryfallCacheRow.ts` | `mergeScryfallCacheRowFromApiCard`, `needsPhase3Backfill` |
| `frontend/app/api/cron/scryfall-cache-phase3-backfill/route.ts` | Cron handler |
| `db/scryfall_cache_phase3_verification.sql` | Verification SELECTs |
| `db/SCRYFALL_CACHE_PHASE3.md` | This doc |
| `frontend/run-phase3-backfill-loop.mjs` | Resumable local loop until completion or stop rules |
