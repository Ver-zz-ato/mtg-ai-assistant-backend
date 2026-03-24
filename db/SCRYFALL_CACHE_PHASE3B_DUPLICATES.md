# Phase 3B — Conservative duplicate cleanup (`scryfall_cache`)

## Goal

Remove **reviewed** duplicate primary keys that block or pollute Phase 3-style scans—especially **chat bracket** rows `[[card name]]` and **print-annotation**-style suffixes—**only when** a **canonical** row with the same logical name already exists as another PK.

## Canonicalization rules (matching only, not invention)

| Pattern | Extract “base” for join | Match canonical `c.name` |
|--------|-------------------------|----------------------------|
| `[[blood artist]]` | Inner text inside `[[` `]]` | `lower(trim(inner)) = lower(trim(c.name))` |
| `blood artist (inr) 97` | Strip trailing `\s+\([^)]+\)\s+\d+\s*$` | `lower(trim(base)) = lower(trim(c.name))` |

**NFKD:** Review SQL uses `lower(trim(...))` only; full NFKD match is in app code (`normalizeScryfallCacheName`). For borderline rows, compare in app or add a one-off check.

## Safety constraints

- **No** automatic delete of MDFC rows (`name` containing ` // `).
- **No** delete solely because `set` / `collector_number` is null.
- **No** delete without a **confirmed** second row `c` that is the intended canonical PK.
- If the dirty row has **richer** data than canonical (images, `type_line`, etc.), **review** — optional `UPDATE` canonical from dirty, then delete dirty (see cleanup SQL comments).

## Artifacts

| File | Purpose |
|------|---------|
| `db/scryfall_cache_phase3b_duplicate_cleanup_review.sql` | **SELECT** only: R1 bracketed+canonical, R2 bracketed orphans, R3 print-style+canonical, R4 richer-dirty sample |
| `db/scryfall_cache_phase3b_duplicate_cleanup.sql` | **Commented** `DELETE` / example `UPDATE` — copy one block at a time after review |

## Counts (fill after you run review SQL)

Run the `count(*)` queries at the end of R1 and R3 (and R2 orphan count). Example placeholders:

- **Bracketed rows with canonical match (R1):** `_` (from `r1_bracketed_with_canonical_match`)
- **Bracketed orphans (R2):** `_` (from `r2_bracketed_orphans_sample`)
- **Print-annotation with canonical match (R3):** `_` (from `r3_print_annotation_with_canonical_match`)

## What is safe to run now

- **Entire** `scryfall_cache_phase3b_duplicate_cleanup_review.sql` — read-only.

## What must be manually reviewed

- Any row where **`images_differ_*`** or **`type_line_differs`** is true — merge or keep.
- **R3** print-regex — rare false positives; verify stripped `base_guess` against real Oracle names.
- **Section 1–3** in the cleanup file — uncomment only after CSV review.

## Relation to Phase 3 backfill

Duplicate PKs such as `[[blood artist]]` vs `blood artist` cause **extra** candidate rows and **non-canonical** `nextAfter` cursors. Deleting **only** the dirty row when canonical exists reduces noise; Phase 3 merge already skips PK mismatch, but scans still **touch** dirty names.
