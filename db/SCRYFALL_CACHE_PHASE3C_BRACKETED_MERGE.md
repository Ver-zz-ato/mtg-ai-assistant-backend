# Phase 3C — Two-bucket bracketed `[[...]]` cleanup

## Buckets

| Bucket | Definition | This pass |
|--------|------------|-----------|
| **A** | `name` ~ `^\[\[.+\]\]$`, not MDFC (`!~ ' // '`), and a **canonical row exists** with `lower(trim(inner)) = lower(trim(canonical.name))` | Review → merge (null-fill only) → delete dirty |
| **B** | Same bracketed pattern, **no** canonical row for that inner name | **Review + optional insert-only canonicalization** — Phase 3D (`SCRYFALL_CACHE_PHASE3D_BUCKET_B.md`, `scryfall_cache_phase3d_bucket_b_*.sql`). **No delete** here. |

**Why two buckets:** Live review showed `bucket_b_count` (e.g. 54) bracketed rows **without** a clean PK. Deleting them would drop the only row for that string key until a canonical row exists.

## Artifacts

| File | Purpose |
|------|---------|
| `scryfall_cache_phase3c_bracketed_merge_review.sql` | Counts (A vs B), Bucket A side-by-side, Bucket B list + heuristics |
| `scryfall_cache_phase3c_bracketed_merge_cleanup.sql` | Commented Bucket A **merge** + **delete** (Bucket B excluded by definition) |

## Counts (run review SQL; fill in)

Run the **first** `SELECT` in `scryfall_cache_phase3c_bracketed_merge_review.sql` **by itself** (highlight block → Run). If you run the entire file at once, Supabase often shows **only the last result**, so you may see just one column (e.g. only `bucket_b_count`) and miss Bucket A.

| Metric | Column | Your value |
|--------|--------|------------|
| Bucket A pair count | `bucket_a_pair_count` | _ |
| Bucket A dirty rows (distinct PK) | `bucket_a_count` | _ |
| Bucket B | `bucket_b_count` | _ (e.g. 54) |
| All bracketed (non-MDFC) | `total_bracketed_non_mdfc` | _ — sanity: distinct A + B should align with this partition |

## Bucket A — merge policy

**Updates:** `COALESCE(c.col, d.col)` for all merged columns — canonical non-null wins; dirty fills only where canonical is NULL. Includes rules/identity fields, `name_norm`, `small`, `normal`, `art_crop`, `rarity`, `"set"`, `collector_number`.

**Caveat:** `legalities = '{}'::jsonb` on canonical is non-null — merge will **not** copy dirty legalities; fix manually if needed.

## ELI5 — safe run order

1. **Review** — In Supabase, run the **first** counts `SELECT`, then the Bucket A **side-by-side** `SELECT` (one block at a time); export CSV.
2. **Merge** — In `scryfall_cache_phase3c_bracketed_merge_cleanup.sql`, uncomment **Section 1** (`BEGIN` … `COMMIT`), run once; repeat until `UPDATE` affects 0 rows if multiple dirties share an `inner_key`.
3. **Delete** — Uncomment **Section 2**, run once.
4. **Phase 3** — `POST /api/cron/scryfall-cache-phase3-backfill` (cursor from last `nextAfter`); `merged` should increase for canonical PKs.

`pick` includes **only** rows with a canonical match (Bucket A), so Bucket B rows are never targeted.

## Bucket B — recommended next steps (no auto-delete)

1. **Strip** outer `[[` / `]]` → candidate PK string (same inner extraction as SQL).
2. **Normalize** like app PK (`normalizeScryfallCacheName` / NFKD lowercase) — SQL review uses `lower(trim)` only; mismatches stay **manual**.
3. **Create or refresh** the canonical row **before** removing the bracketed row:
   - Scryfall **named card** API by stripped name, then upsert via existing cache builders (`buildScryfallCacheRowFromApiCard` / `mergeScryfallCacheRowFromApiCard`).
   - Or run **Phase 3 backfill** / bulk cache routes so the clean name is populated from API.
4. After canonical exists → row becomes **Bucket A** → use merge + delete as above.
5. **Do not** bulk-delete Bucket B rows in SQL this pass.

## Edge cases (manual)

- **NFKD / accent** mismatch between inner extract and canonical PK.
- **Multiple dirty** PKs per `inner_key`: repeat merge+delete until exhausted.
- **MDFC** (` // `): excluded from these queries; treat separately.
- **Garbage inner strings** in Bucket B: triage with `stripped_len`, `no_brackets_in_stripped`, `oracle_text` / image flags in review query.
