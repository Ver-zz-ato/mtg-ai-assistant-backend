-- =============================================================================
-- Phase 3D — BUCKET B: insert clean canonical rows (COMMENTED — no DELETE)
-- Preconditions: review scryfall_cache_phase3d_bucket_b_review.sql and CSV export.
--
-- Inserts one row per DISTINCT proposed_canonical_pk (lower(trim(inner))).
-- Copies rules/identity fields from one dirty row (deterministic: ORDER BY dirty_pk).
-- Does NOT set: small, normal, art_crop, rarity, "set", collector_number (stay NULL).
--
-- PK / name_norm: lower(trim(stripped inner)). This matches Phase 3C join logic but is
-- NOT full NFKD (normalizeScryfallCacheName in app). Phase 3 backfill can align.
--
-- ON CONFLICT (name) DO NOTHING — safe if row created between review and run.
-- =============================================================================

-- =============================================================================
-- SECTION 0 — Preview: row count INSERT would attempt (safe candidates, distinct PK)
-- =============================================================================
/*
SELECT count(*) AS insert_attempt_distinct_pk
FROM (
  SELECT DISTINCT ON (lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))))
    d.name
  FROM public.scryfall_cache d
  WHERE d.name ~ '^\[\[.+\]\]$'
    AND d.name !~ ' // '
    AND NOT EXISTS (
      SELECT 1
      FROM public.scryfall_cache c
      WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
        AND c.name <> d.name
    )
    AND trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) <> ''
    AND length(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) BETWEEN 1 AND 200
    AND trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ '[\[\]]'
    AND trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ ' // '
    AND lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) NOT IN (
      'doomblade',
      'dreadreturn',
      'galagreeters',
      'gutshot',
      'nature''sclaim',
      'stormthevault',
      'ghoulcaller''s accomplice',
      'seeker''s squire',
      U&'ghoulcaller\2019s accomplice',
      U&'seeker\2019s squire'
    )
  ORDER BY lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))), d.name
) sub;
*/


-- =============================================================================
-- SECTION 1 — INSERT canonical rows (uncomment BEGIN/COMMIT to run)
-- =============================================================================
/*
BEGIN;

INSERT INTO public.scryfall_cache (
  name,
  name_norm,
  type_line,
  oracle_text,
  mana_cost,
  cmc,
  color_identity,
  legalities,
  colors,
  keywords,
  power,
  toughness,
  loyalty,
  is_land,
  is_creature,
  is_instant,
  is_sorcery,
  is_enchantment,
  is_artifact,
  is_planeswalker,
  updated_at
)
SELECT DISTINCT ON (lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))))
  lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))),
  lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))),
  d.type_line,
  d.oracle_text,
  d.mana_cost,
  COALESCE(d.cmc, 0),
  d.color_identity,
  d.legalities,
  d.colors,
  d.keywords,
  d.power,
  d.toughness,
  d.loyalty,
  d.is_land,
  d.is_creature,
  d.is_instant,
  d.is_sorcery,
  d.is_enchantment,
  d.is_artifact,
  d.is_planeswalker,
  now()
FROM public.scryfall_cache d
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
  AND NOT EXISTS (
    SELECT 1
    FROM public.scryfall_cache c
    WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
      AND c.name <> d.name
  )
  AND trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) <> ''
  AND length(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) BETWEEN 1 AND 200
  AND trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ '[\[\]]'
  AND trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ ' // '
  AND lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) NOT IN (
    'doomblade',
    'dreadreturn',
    'galagreeters',
    'gutshot',
    'nature''sclaim',
    'stormthevault',
    'ghoulcaller''s accomplice',
    'seeker''s squire',
    U&'ghoulcaller\2019s accomplice',
    U&'seeker\2019s squire'
  )
ORDER BY lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))), d.name
ON CONFLICT (name) DO NOTHING;

COMMIT;
*/
