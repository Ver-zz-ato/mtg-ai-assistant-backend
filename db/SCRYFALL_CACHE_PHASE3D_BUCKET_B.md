# Phase 3D — Bucket B canonicalization (insert only, no delete)

## Goal

For **Bucket B** bracketed rows (`[[...]]` with no matching canonical row yet), **insert** a new `scryfall_cache` row using `lower(trim(inner))` as `name` / `name_norm`, copying allowed rules/identity fields from the dirty row. **Do not delete** bracketed rows in this pass.

## Artifacts

| File | Purpose |
|------|---------|
| `scryfall_cache_phase3d_bucket_b_review.sql` | Counts (`bucket_b_total`, `bucket_b_safe_candidate_count`, distinct PK count), safe-candidate review list, rows that fail shape checks |
| `scryfall_cache_phase3d_bucket_b_canonicalization.sql` | Commented `INSERT` + preview count |

## Safe-candidate rule (conservative)

All must be true:

1. `name` matches `^\[\[.+\]\]$` and does **not** match ` // ` (same bracketed filter as Phase 3C).
2. **No canonical row** exists: `NOT EXISTS` row `c` with `lower(trim(c.name)) = lower(trim(inner))` and `c.name <> d.name`.
3. `inner = trim(regexp_replace(name, '^\[\[(.*)\]\]$', '\1'))` is non-empty.
4. `length(inner)` between 1 and 200.
5. `inner !~ '[\[\]]'` (no nested brackets).
6. `inner !~ ' // '` (not MDFC-shaped **name**).

**Proposed canonical PK** in SQL: `lower(trim(inner))` — aligns with Phase 3C matching but **does not** apply Unicode NFKD (`normalizeScryfallCacheName`). Expect Phase 3 to refine `name_norm` and full fields from Scryfall API where needed.

## Insert behavior

- **One row per distinct** `lower(trim(inner))` when multiple dirty PKs map to the same canonical key (`DISTINCT ON` picks lexicographically smallest `dirty_pk`).
- **Columns set:** `name`, `name_norm`, `type_line`, `oracle_text`, `mana_cost`, `cmc` (COALESCE to 0), `color_identity`, `legalities`, `colors`, `keywords`, `power`, `toughness`, `loyalty`, all `is_*` flags, `updated_at`.
- **Left NULL:** `small`, `normal`, `art_crop`, `rarity`, `"set"`, `collector_number` — do not invent from dirty if missing; images/set codes come from API or later flows.
- **`ON CONFLICT (name) DO NOTHING`** if a canonical row appeared between review and run.

## Counts (fill after running review)

| Column | Meaning |
|--------|---------|
| `bucket_b_total` | All Bucket B bracketed rows |
| `bucket_b_safe_candidate_count` | Dirty rows passing shape + NOT EXISTS |
| `bucket_b_safe_distinct_canonical_pk_count` | Distinct inserts if every inner key is unique |

If your sample of 54 Bucket B rows all pass the inner checks, **`bucket_b_safe_candidate_count`** should be **54** and **`bucket_b_safe_distinct_canonical_pk_count`** ≤ 54 (equal when no duplicate inner keys).

## Order of operations

1. Run **first** `SELECT` in `scryfall_cache_phase3d_bucket_b_review.sql` alone → record counts.
2. Export **safe candidates** `SELECT` (CSV).
3. **Section 0** preview in canonicalization SQL (optional).
4. Uncomment **Section 1** `INSERT` in a transaction; verify row count.

**After:** Bracketed dirty rows still exist. Run **Phase 3C Bucket A** merge + delete (or a new pass) to merge nulls from `[[...]]` into the new canonical row and remove bracketed rows.

## Resume Phase 3 backfill?

**Yes, recommended** after inserts:

- New canonical rows will often **still** match `needsPhase3Backfill` (missing legalities, images, NFKD `name_norm`, etc.).
- **Phase 3 cron** (`/api/cron/scryfall-cache-phase3-backfill`) will upsert from Scryfall API and align `name_norm`, `legalities`, `image_uris`, and flags without relying on SQL-only normalization.

Run Phase 3 after canonicalization so the DB converges to API truth; do not treat SQL-only inserts as complete oracle cards.

## Manual / risky edge cases

| Risk | Mitigation |
|------|------------|
| **Typo / concatenated names** (`doomblade`, `stormthevault`, `galagreeters`) | Wrong PK vs Scryfall oracle; **review CSV** before INSERT; fix one-off or skip. |
| **NFKD / apostrophe** (`'` vs `'`) | SQL `lower(trim)` ≠ `normalizeScryfallCacheName`; duplicate PK risk vs real card — Phase 3 or manual merge. |
| **MDFC / battle / adventure** in `type_line` | Name is still single-face string; oracle text may be front-only — API backfill corrects. |
| **Curly punctuation in PK** | Rare; if canonical exists under ASCII-only PK, `NOT EXISTS` may miss — manual. |
| **Duplicate `[[x]]` / `[[ X ]]`** | `DISTINCT ON` keeps one dirty row as source. |

## Deletion

**Not in this pass.** After canonical rows exist and Bucket A merge has copied any remaining nulls, use Phase 3C delete for bracketed rows (separate reviewed step).
