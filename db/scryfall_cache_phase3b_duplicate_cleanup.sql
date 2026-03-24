-- =============================================================================
-- Phase 3B — OPTIONAL cleanup (COMMENTED). Review scryfall_cache_phase3b_duplicate_cleanup_review.sql first.
-- Target: delete ONLY dirty duplicate PKs when a canonical row already exists and you accept losing dirty-only data.
-- Does NOT run MDFC rows ( // ), does not touch rows without a confirmed canonical match.
-- =============================================================================

-- =============================================================================
-- SECTION 0 — REVIEW FIRST
-- =============================================================================
-- Export CSV from R1/R3 SELECTs; spot-check inner_raw/base_guess vs canonical_pk.
-- If images_differ_* is true, decide whether to merge into canonical manually before DELETE.


-- =============================================================================
-- SECTION 1 — SAFE DELETES (bracketed [[...]] only, canonical exists, same images)
-- Only when small+normal+art_crop match canonical (no unique art on dirty row).
-- TUNE: remove image match requirement if you verified merge elsewhere.
-- =============================================================================
/*
DELETE FROM public.scryfall_cache d
USING public.scryfall_cache c
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
  AND lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
  AND c.name <> d.name
  AND d.small IS NOT DISTINCT FROM c.small
  AND d.normal IS NOT DISTINCT FROM c.normal
  AND d.art_crop IS NOT DISTINCT FROM c.art_crop;
*/


-- =============================================================================
-- SECTION 2 — SAFE DELETES (bracketed) — canonical exists, dirty images all null
-- =============================================================================
/*
DELETE FROM public.scryfall_cache d
USING public.scryfall_cache c
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
  AND lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
  AND c.name <> d.name
  AND d.small IS NULL
  AND d.normal IS NULL
  AND d.art_crop IS NULL;
*/


-- =============================================================================
-- SECTION 3 — Print-annotation duplicates (higher false-positive risk — review R3 first)
-- Safe delete only when stripped base matches canonical AND images align.
-- =============================================================================
/*
DELETE FROM public.scryfall_cache d
USING public.scryfall_cache c
WHERE d.name !~ ' // '
  AND d.name ~ '\([^)]+\)\s+\d+\s*$'
  AND lower(trim(regexp_replace(trim(d.name), '\s+\([^)]+\)\s+\d+\s*$', ''))) = lower(trim(c.name))
  AND c.name <> d.name
  AND d.small IS NOT DISTINCT FROM c.small
  AND d.normal IS NOT DISTINCT FROM c.normal
  AND d.art_crop IS NOT DISTINCT FROM c.art_crop;
*/


-- =============================================================================
-- SECTION 4 — OPTIONAL UPDATE (manual): copy missing image URLs from dirty → canonical
-- Run one pair at a time after review; not batched here.
-- =============================================================================
/*
UPDATE public.scryfall_cache c
SET
  small = COALESCE(c.small, d.small),
  normal = COALESCE(c.normal, d.normal),
  art_crop = COALESCE(c.art_crop, d.art_crop),
  updated_at = now()
FROM public.scryfall_cache d
WHERE c.name = 'blood artist'
  AND d.name = '[[blood artist]]';
*/
