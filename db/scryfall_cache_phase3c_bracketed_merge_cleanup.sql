-- =============================================================================
-- Phase 3C — BUCKET A ONLY: bracketed [[...]] merge-then-delete (COMMENTED)
-- BUCKET B (no canonical): do NOT run merge/delete here — review only in
-- scryfall_cache_phase3c_bracketed_merge_review.sql
--
-- Merge: COALESCE(canonical, dirty) per column — fills canonical NULLs only;
-- populated canonical values are preserved (including images, set, collector, rarity).
-- Caveat: legalities = '{}'::jsonb is non-null — merge will not copy dirty legalities.
-- Run review SQL first.
-- =============================================================================

-- =============================================================================
-- SECTION 0 — REVIEW FIRST
-- =============================================================================
-- Export Bucket A side-by-side; confirm Bucket B count; resolve multi-dirty inner_key.


-- =============================================================================
-- SECTION 1 — SAFE MERGE (Bucket A only): one dirty row per inner_key
-- pick = bracketed rows that HAVE a canonical match (NOT Bucket B).
-- =============================================================================
/*
BEGIN;

WITH pick AS (
  SELECT DISTINCT ON (lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))))
    d.name AS dirty_pk
  FROM public.scryfall_cache d
  WHERE d.name ~ '^\[\[.+\]\]$'
    AND d.name !~ ' // '
    AND EXISTS (
      SELECT 1
      FROM public.scryfall_cache c
      WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
        AND c.name <> d.name
    )
  ORDER BY lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))), d.name
)
UPDATE public.scryfall_cache AS c
SET
  type_line = COALESCE(c.type_line, d.type_line),
  oracle_text = COALESCE(c.oracle_text, d.oracle_text),
  mana_cost = COALESCE(c.mana_cost, d.mana_cost),
  cmc = COALESCE(c.cmc, d.cmc),
  color_identity = COALESCE(c.color_identity, d.color_identity),
  legalities = COALESCE(c.legalities, d.legalities),
  name_norm = COALESCE(c.name_norm, d.name_norm),
  colors = COALESCE(c.colors, d.colors),
  keywords = COALESCE(c.keywords, d.keywords),
  power = COALESCE(c.power, d.power),
  toughness = COALESCE(c.toughness, d.toughness),
  loyalty = COALESCE(c.loyalty, d.loyalty),
  is_land = COALESCE(c.is_land, d.is_land),
  is_creature = COALESCE(c.is_creature, d.is_creature),
  is_instant = COALESCE(c.is_instant, d.is_instant),
  is_sorcery = COALESCE(c.is_sorcery, d.is_sorcery),
  is_enchantment = COALESCE(c.is_enchantment, d.is_enchantment),
  is_artifact = COALESCE(c.is_artifact, d.is_artifact),
  is_planeswalker = COALESCE(c.is_planeswalker, d.is_planeswalker),
  small = COALESCE(c.small, d.small),
  normal = COALESCE(c.normal, d.normal),
  art_crop = COALESCE(c.art_crop, d.art_crop),
  rarity = COALESCE(c.rarity, d.rarity),
  "set" = COALESCE(c."set", d."set"),
  collector_number = COALESCE(c.collector_number, d.collector_number),
  updated_at = now()
FROM public.scryfall_cache AS d
JOIN pick ON pick.dirty_pk = d.name
WHERE lower(trim(c.name)) = lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')))
  AND c.name <> d.name;

-- If multiple dirty rows per inner_key, re-run SECTION 1 until 0 rows updated.

COMMIT;
*/


-- =============================================================================
-- SECTION 2 — SAFE DELETE (Bucket A, after merge): same dirty rows as SECTION 1 `pick`
-- =============================================================================
/*
BEGIN;

WITH pick AS (
  SELECT DISTINCT ON (lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))))
    d.name AS dirty_pk
  FROM public.scryfall_cache d
  WHERE d.name ~ '^\[\[.+\]\]$'
    AND d.name !~ ' // '
    AND EXISTS (
      SELECT 1
      FROM public.scryfall_cache c
      WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
        AND c.name <> d.name
    )
  ORDER BY lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))), d.name
)
DELETE FROM public.scryfall_cache AS d
USING pick
WHERE d.name = pick.dirty_pk
  AND EXISTS (
    SELECT 1
    FROM public.scryfall_cache AS c
    WHERE lower(trim(c.name)) = lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')))
      AND c.name <> d.name
  );

COMMIT;
*/


-- =============================================================================
-- SECTION 2b — OPTIONAL: after repeated merge+delete, delete remaining Bucket A bracketed rows
-- =============================================================================
/*
BEGIN;

DELETE FROM public.scryfall_cache AS d
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
  AND EXISTS (
    SELECT 1
    FROM public.scryfall_cache AS c
    WHERE lower(trim(c.name)) = lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')))
      AND c.name <> d.name
  );

COMMIT;
*/


-- =============================================================================
-- SECTION 3 — Preview: rows SECTION 1 merge would touch (Bucket A pick × canonical)
-- =============================================================================
/*
SELECT count(*) AS rows_merge_update_would_touch
FROM public.scryfall_cache c
JOIN public.scryfall_cache d
  ON lower(trim(c.name)) = lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')))
 AND c.name <> d.name
JOIN (
  SELECT DISTINCT ON (lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))))
    d.name AS dirty_pk
  FROM public.scryfall_cache d
  WHERE d.name ~ '^\[\[.+\]\]$'
    AND d.name !~ ' // '
    AND EXISTS (
      SELECT 1
      FROM public.scryfall_cache c2
      WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c2.name))
        AND c2.name <> d.name
    )
  ORDER BY lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))), d.name
) pick ON pick.dirty_pk = d.name;
*/
