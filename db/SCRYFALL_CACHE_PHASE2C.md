# Phase 2C — `public.scryfall_cache` historical cleanup (planning)

**Goal:** After Phase 2B (image-cache writes use canonical oracle identity), identify and optionally remove **only** the most obviously bad historical rows. **Conservative, review-first.**

## Root cause (historic)

Image-cache upserts used **request keys** as `name`, allowing punctuation, bullets, and sentence-like strings into `scryfall_cache`. That path is fixed; Phase 2C addresses **legacy** rows only.

## Tier strategy

| Tier | Meaning | Action |
|------|---------|--------|
| **A — Very safe** | Trivial variant of an existing PK (`canonical` row already present); or extreme prompt-like row with **no** type_line, oracle_text, legalities | Optional automated SQL **after** SELECT preview (see cleanup script) |
| **B — Review needed** | Leading bullets with ambiguous `regexp_replace`; Q06 prompt patterns on short strings; any duplicate where identity is unclear | Manual triage in SQL editor; no batch automation |
| **C — Do not touch automatically** | Plausible card metadata; one-word names; MDFCs; null `set` / `collector_number` alone; obscure but valid Oracle names | No automatic delete |

## Canonical repair vs delete

- **Prefer DELETE of junk row** when a **canonical row with the same card** already exists (e.g. trailing `.` duplicate).
- **Do not** “merge” image columns into canonical in this phase unless you have verified the junk row is strictly redundant (same card).

## Artifacts (exact paths)

| File | Purpose |
|------|---------|
| `db/scryfall_cache_phase2c_review.sql` | **Read-only** SELECTs (Q01–Q09): long names, many words, markers, trailing punct, prompt-ish, `name`/`name_norm`, sparse metadata |
| `db/scryfall_cache_phase2c_cleanup.sql` | **Commented** optional `DELETE`/`UPDATE` patterns; sections **REVIEW FIRST**, **SAFE UPDATES**, **SAFE DELETES** |

## What is safe to run immediately

- **All statements in `scryfall_cache_phase2c_review.sql`** — SELECT only; safe in production for inspection.

## What needs manual review first

- **Any uncommented `DELETE` in `scryfall_cache_phase2c_cleanup.sql`** — run matching SELECT previews, export small CSV, confirm zero legitimate cards.
- **Section 1 (1a–1c)** — spot-check that `regexp_replace` targets only junk (especially MDFCs: `name` containing ` // `).
- **Section 2 (2a)** — tune `length` / `word_count` thresholds using Q01/Q02/Q09 counts; image-only junk may still have `small`/`normal` URLs.

## Cleanup before backfill (Phase 3)?

- **Recommended order:** Run **review queries** → optional **Tier A** cleanup (duplicate variants + extreme prompt rows) → then **Phase 3 backfill**, so backfill does not re-process or conflict with junk PKs.
- If junk row count is **tiny**, backfill can run first; **risk is low** if backfill is keyed by canonical names and skips invalid keys. Prefer **review → optional Tier A delete → backfill** when historical junk volume is non-trivial.

## Junk categories (inventory)

| ID | Category | Review query |
|----|----------|----------------|
| Q01 | Long names | `length(name) > 200` |
| Q02 | Many words (sentence-like) | word count `> 25` |
| Q03 | Leading list/bullet/dash | regex `^[\s*•·‣⁃]+` or `^[\-–—]\s+` |
| Q04 | Trailing punctuation | `[\.,:;!?]+$` |
| Q05 | Trailing dot + canonical pair | self-join via `regexp_replace(..., '\.$', '')` |
| Q06 | Prompt/URL-like | `http`, `explain`, `?`, etc. |
| Q07 | `name` ≠ `name_norm` | Phase 2A drift |
| Q08 | Sparse metadata (context only) | null type/oracle/legalities |
| Q09 | Overlap (long + many words + sparse) | manual triage |

## Safest fixes (summary)

1. **Delete duplicate PK** where trivial variant exists (trailing `.`, leading `- `) and canonical row present — **Section 1** in cleanup script.
2. **Delete extreme prompt rows** only with **Section 2** predicates and **SELECT preview** — thresholds must match your DB counts.

## Edge cases remaining

- Legitimate long names (unlikely above 200 chars) — verify Q01 list.
- Cards with `?` in **flavor** on Oracle text are not in `name`; `?` in `name` is still worth manual review (Q06).
- Split cards: never strip `" // "` or automate merges without name-level review.
