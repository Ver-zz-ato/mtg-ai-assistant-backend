-- =============================================================================
-- Phase 3C — TWO-BUCKET REVIEW ONLY: bracketed [[...]] rows in public.scryfall_cache
-- Run in Supabase SQL editor. No mutations.
--
-- BUCKET A — bracketed row has matching canonical (inner name = canonical PK, case-insensitive trim)
-- BUCKET B — bracketed row has NO canonical yet (do NOT delete in this pass)
--
-- HOW TO RUN: Execute ONLY the first SELECT below (highlight it, then Run), or run
-- statements one at a time. Running the whole file at once often returns ONLY the
-- last query — so you may see just bucket_b_count and miss Bucket A totals.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- COUNTS: Bucket A vs Bucket B (bracketed, non-MDFC pattern) — RUN THIS BLOCK ALONE
-- -----------------------------------------------------------------------------
SELECT
  (
    SELECT count(*)
    FROM public.scryfall_cache d
    JOIN public.scryfall_cache c
      ON lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
     AND c.name <> d.name
    WHERE d.name ~ '^\[\[.+\]\]$'
      AND d.name !~ ' // '
  ) AS bucket_a_pair_count,
  (
    SELECT count(DISTINCT d.name)
    FROM public.scryfall_cache d
    JOIN public.scryfall_cache c
      ON lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
     AND c.name <> d.name
    WHERE d.name ~ '^\[\[.+\]\]$'
      AND d.name !~ ' // '
  ) AS bucket_a_count,
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
  ) AS bucket_b_count,
  (
    SELECT count(*)
    FROM public.scryfall_cache d
    WHERE d.name ~ '^\[\[.+\]\]$'
      AND d.name !~ ' // '
  ) AS total_bracketed_non_mdfc;

-- -----------------------------------------------------------------------------
-- BUCKET A — Side-by-side VALUES: dirty vs canonical (export CSV before merge)
-- -----------------------------------------------------------------------------
SELECT
  d.name AS dirty_pk,
  c.name AS canonical_pk,
  trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) AS inner_extracted,
  d.type_line AS d_type_line,
  c.type_line AS c_type_line,
  d.oracle_text AS d_oracle_text,
  c.oracle_text AS c_oracle_text,
  d.mana_cost AS d_mana_cost,
  c.mana_cost AS c_mana_cost,
  d.cmc AS d_cmc,
  c.cmc AS c_cmc,
  d.color_identity AS d_color_identity,
  c.color_identity AS c_color_identity,
  d.legalities AS d_legalities,
  c.legalities AS c_legalities,
  d.colors AS d_colors,
  c.colors AS c_colors,
  d.keywords AS d_keywords,
  c.keywords AS c_keywords,
  d.power AS d_power,
  c.power AS c_power,
  d.toughness AS d_toughness,
  c.toughness AS c_toughness,
  d.loyalty AS d_loyalty,
  c.loyalty AS c_loyalty,
  d.is_land AS d_is_land,
  c.is_land AS c_is_land,
  d.is_creature AS d_is_creature,
  c.is_creature AS c_is_creature,
  d.is_instant AS d_is_instant,
  c.is_instant AS c_is_instant,
  d.is_sorcery AS d_is_sorcery,
  c.is_sorcery AS c_is_sorcery,
  d.is_enchantment AS d_is_enchantment,
  c.is_enchantment AS c_is_enchantment,
  d.is_artifact AS d_is_artifact,
  c.is_artifact AS c_is_artifact,
  d.is_planeswalker AS d_is_planeswalker,
  c.is_planeswalker AS c_is_planeswalker,
  d.small AS d_small,
  c.small AS c_small,
  d.normal AS d_normal,
  c.normal AS c_normal,
  d.art_crop AS d_art_crop,
  c.art_crop AS c_art_crop,
  d.rarity AS d_rarity,
  c.rarity AS c_rarity,
  d."set" AS d_set,
  c."set" AS c_set,
  d.collector_number AS d_collector_number,
  c.collector_number AS c_collector_number
FROM public.scryfall_cache d
JOIN public.scryfall_cache c
  ON lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
 AND c.name <> d.name
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
ORDER BY d.name;

-- -----------------------------------------------------------------------------
-- BUCKET A — Multiple dirty PKs per inner key (repeat merge+delete passes)
-- -----------------------------------------------------------------------------
SELECT
  lower(trim(regexp_replace(name, '^\[\[(.*)\]\]$', '\1'))) AS inner_key,
  count(*) AS dirty_count,
  array_agg(name ORDER BY name) AS dirty_pks
FROM public.scryfall_cache d
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
  AND EXISTS (
    SELECT 1
    FROM public.scryfall_cache c
    WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
      AND c.name <> d.name
  )
GROUP BY 1
HAVING count(*) > 1;

-- -----------------------------------------------------------------------------
-- BUCKET B — Bracketed rows with NO canonical (review only; no delete this pass)
-- -----------------------------------------------------------------------------
SELECT
  d.name AS dirty_pk,
  trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) AS stripped_inner_name,
  length(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) AS stripped_len,
  (trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) <> '') AS stripped_nonempty,
  (length(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) BETWEEN 1 AND 200) AS len_between_1_and_200,
  (trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ '[\[\]]') AS no_brackets_in_stripped,
  (trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) !~ ' // ') AS not_mdfc_shape_in_stripped,
  d.type_line,
  d.oracle_text,
  d.small IS NOT NULL AS dirty_has_small,
  d.normal IS NOT NULL AS dirty_has_normal
FROM public.scryfall_cache d
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
  AND NOT EXISTS (
    SELECT 1
    FROM public.scryfall_cache c
    WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1'))) = lower(trim(c.name))
      AND c.name <> d.name
  )
ORDER BY d.name;
