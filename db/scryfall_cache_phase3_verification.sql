-- =============================================================================
-- Phase 3 — Verification queries for public.scryfall_cache (read-only)
-- Run after backfill batches; tune expectations against your bulk import coverage.
-- =============================================================================

-- Row counts
SELECT count(*) AS total_rows FROM public.scryfall_cache;

-- name_norm coverage
SELECT
  count(*) FILTER (WHERE name_norm IS NOT NULL AND trim(name_norm) <> '') AS name_norm_set,
  count(*) FILTER (WHERE name_norm IS NULL OR trim(name_norm) = '') AS name_norm_missing
FROM public.scryfall_cache;

-- Optional: align name_norm with PK where still null (safe if PK is already canonical)
-- UPDATE public.scryfall_cache SET name_norm = name WHERE name_norm IS NULL;

-- Semantic / Phase 2A columns
SELECT
  count(*) FILTER (WHERE keywords IS NOT NULL) AS has_keywords,
  count(*) FILTER (WHERE colors IS NOT NULL) AS has_colors,
  count(*) FILTER (WHERE power IS NOT NULL) AS has_power,
  count(*) FILTER (WHERE loyalty IS NOT NULL) AS has_loyalty,
  count(*) FILTER (WHERE is_land IS NOT NULL) AS has_any_land_flag
FROM public.scryfall_cache;

-- Type flags populated (at least one non-null)
SELECT count(*) AS rows_with_any_type_flag
FROM public.scryfall_cache
WHERE is_land IS NOT NULL
   OR is_creature IS NOT NULL
   OR is_instant IS NOT NULL
   OR is_sorcery IS NOT NULL
   OR is_enchantment IS NOT NULL
   OR is_artifact IS NOT NULL
   OR is_planeswalker IS NOT NULL;

-- Legalities
SELECT
  count(*) FILTER (WHERE legalities IS NOT NULL AND legalities <> '{}'::jsonb) AS has_legalities,
  count(*) FILTER (WHERE legalities IS NULL) AS legalities_null
FROM public.scryfall_cache;

-- Sample spot-checks
SELECT name, name_norm, type_line, is_land, colors, keywords, legalities IS NOT NULL AS has_leg
FROM public.scryfall_cache
WHERE type_line IS NOT NULL
ORDER BY updated_at DESC NULLS LAST
LIMIT 20;

SELECT name, type_line, small IS NOT NULL AS has_small, legalities IS NOT NULL AS has_leg
FROM public.scryfall_cache
WHERE (small IS NOT NULL OR normal IS NOT NULL)
  AND type_line IS NULL
LIMIT 30;
