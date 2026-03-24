-- =============================================================================
-- Phase 3D — BUCKET B REVIEW ONLY: bracketed rows with NO canonical row yet
-- Run statements separately (Supabase often returns only the last result).
-- No mutations. See SCRYFALL_CACHE_PHASE3D_BUCKET_B.md for safe-candidate rules.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Safe-candidate definition (matches canonicalization script)
--
-- A row is a safe candidate when ALL hold:
--   1) d.name ~ '^\[\[.+\]\]$'  AND  d.name !~ ' // '  (bracketed, exclude MDFC-PK pattern)
--   2) NOT EXISTS canonical: no row c with lower(trim(c.name)) = lower(trim(inner))
--      where inner = trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))
--   3) inner_stripped non-empty after trim
--   4) length(inner_stripped) between 1 and 200
--   5) inner_stripped !~ '[\[\]]'  (no nested brackets)
--   6) inner_stripped !~ ' // '  (not MDFC-shaped name)
--
-- SQL cannot apply app NFKD normalization; canonical PK uses lower(trim(inner)).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- COUNT: Bucket B total vs safe candidates (run this block alone)
-- -----------------------------------------------------------------------------
SELECT
  (
    SELECT count(*)
    FROM public.scryfall_cache d
    WHERE d.name ~ '^\[\[.+\]\]$'
      AND d.name !~ ' // '
      AND NOT EXISTS (
        SELECT 1
        FROM public.scryfall_cache c
        WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
          AND c.name <> d.name
      )
  ) AS bucket_b_total,
  (
    SELECT count(*)
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
  ) AS bucket_b_safe_candidate_count,
  (
    SELECT count(DISTINCT lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))))
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
  ) AS bucket_b_safe_distinct_canonical_pk_count;

-- -----------------------------------------------------------------------------
-- REVIEW: safe candidates with metadata + flags (export CSV before any INSERT)
-- -----------------------------------------------------------------------------
SELECT
  d.name AS dirty_pk,
  trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) AS stripped_inner_name,
  lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) AS proposed_canonical_pk,
  d.type_line,
  d.oracle_text,
  d.mana_cost,
  d.cmc,
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
  d.small IS NOT NULL AS dirty_has_small,
  d.normal IS NOT NULL AS dirty_has_normal,
  d.rarity IS NOT NULL AS dirty_has_rarity,
  d."set" IS NOT NULL AS dirty_has_set,
  (trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) <> '') AS safe_nonempty,
  (length(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) BETWEEN 1 AND 200) AS safe_len,
  (trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ '[\[\]]') AS safe_no_brackets,
  (trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ ' // ') AS safe_not_mdfc_name
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
ORDER BY proposed_canonical_pk, d.name;

-- -----------------------------------------------------------------------------
-- NOT safe (Bucket B but fails shape checks) — should be empty if all 54 are safe
-- -----------------------------------------------------------------------------
SELECT
  d.name AS dirty_pk,
  trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) AS stripped_inner_name
FROM public.scryfall_cache d
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
  AND NOT EXISTS (
    SELECT 1
    FROM public.scryfall_cache c
    WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
      AND c.name <> d.name
  )
  AND NOT (
    trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) <> ''
    AND length(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) BETWEEN 1 AND 200
    AND trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ '[\[\]]'
    AND trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ ' // '
  )
ORDER BY d.name;
