-- =============================================================================
-- Phase 3B — REVIEW ONLY: obvious duplicate PKs vs canonical rows in scryfall_cache
-- Run in Supabase SQL editor. No mutations.
-- Patterns: (1) [[...]] chat-style brackets (2) trailing print-style (set) collector
-- =============================================================================

-- -----------------------------------------------------------------------------
-- R1 — Bracketed rows: name matches [[ ... ]] (double brackets, common chat token)
-- Inner text compared to existing PK using lower(trim(inner)) = lower(trim(canonical))
-- Excludes MDFC " // " in dirty name.
-- -----------------------------------------------------------------------------
WITH bracketed AS (
  SELECT
    name,
    trim(regexp_replace(name, '^\[\[(.*)\]\]$', '\1')) AS inner_raw
  FROM public.scryfall_cache
  WHERE name ~ '^\[\[.+\]\]$'
    AND name !~ ' // '
)
SELECT
  d.name AS dirty_pk,
  b.inner_raw,
  lower(b.inner_raw) AS inner_norm,
  c.name AS canonical_pk,
  (d.small IS DISTINCT FROM c.small) AS images_differ_small,
  (d.normal IS DISTINCT FROM c.normal) AS images_differ_normal,
  (d.type_line IS DISTINCT FROM c.type_line) AS type_line_differs,
  (d.oracle_text IS DISTINCT FROM c.oracle_text) AS oracle_differs,
  (d.legalities IS DISTINCT FROM c.legalities) AS legalities_differs
FROM public.scryfall_cache d
JOIN bracketed b ON b.name = d.name
JOIN public.scryfall_cache c
  ON lower(trim(b.inner_raw)) = lower(trim(c.name))
 AND c.name <> d.name
ORDER BY d.name;

SELECT count(*) AS r1_bracketed_with_canonical_match
FROM public.scryfall_cache d
JOIN LATERAL (
  SELECT trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) AS inner_raw
) b ON true
JOIN public.scryfall_cache c
  ON lower(trim(b.inner_raw)) = lower(trim(c.name))
 AND c.name <> d.name
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // ';


-- -----------------------------------------------------------------------------
-- R2 — Bracketed rows with NO matching canonical (orphans / junk) — triage only
-- -----------------------------------------------------------------------------
SELECT d.name
FROM public.scryfall_cache d
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
  AND NOT EXISTS (
    SELECT 1
    FROM public.scryfall_cache c
    WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')))
          = lower(trim(c.name))
      AND c.name <> d.name
  )
ORDER BY d.name
LIMIT 200;

SELECT count(*) AS r2_bracketed_orphans_sample
FROM public.scryfall_cache d
WHERE d.name ~ '^\[\[.+\]\]$'
  AND d.name !~ ' // '
  AND NOT EXISTS (
    SELECT 1
    FROM public.scryfall_cache c
    WHERE lower(trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')))
          = lower(trim(c.name))
      AND c.name <> d.name
  );


-- -----------------------------------------------------------------------------
-- R3 — Print-annotation style: trailing " (something) 123" (set-ish + number)
-- Stripped base compared to an existing PK. Conservative regex; review false positives.
-- Excludes MDFC.
-- -----------------------------------------------------------------------------
WITH stripped AS (
  SELECT
    name,
    trim(regexp_replace(trim(name), '\s+\([^)]+\)\s+\d+\s*$', '')) AS base_guess
  FROM public.scryfall_cache
  WHERE name ~ '\([^)]+\)\s+\d+\s*$'
    AND name !~ ' // '
)
SELECT
  d.name AS dirty_pk,
  s.base_guess,
  lower(trim(s.base_guess)) AS base_norm,
  c.name AS canonical_pk,
  (d.small IS DISTINCT FROM c.small) AS images_differ_small,
  (d.normal IS DISTINCT FROM c.normal) AS images_differ_normal,
  (d.type_line IS DISTINCT FROM c.type_line) AS type_line_differs
FROM public.scryfall_cache d
JOIN stripped s ON s.name = d.name
JOIN public.scryfall_cache c
  ON lower(trim(s.base_guess)) = lower(trim(c.name))
 AND c.name <> d.name
ORDER BY d.name;

SELECT count(*) AS r3_print_annotation_with_canonical_match
FROM public.scryfall_cache d
JOIN LATERAL (
  SELECT trim(regexp_replace(trim(d.name), '\s+\([^)]+\)\s+\d+\s*$', '')) AS base_guess
) s ON true
JOIN public.scryfall_cache c
  ON lower(trim(s.base_guess)) = lower(trim(c.name))
 AND c.name <> d.name
WHERE d.name ~ '\([^)]+\)\s+\d+\s*$'
  AND d.name !~ ' // ';


-- -----------------------------------------------------------------------------
-- R4 — Dirty row richer than canonical? (merge candidates — manual only)
-- -----------------------------------------------------------------------------
SELECT
  d.name AS dirty_pk,
  c.name AS canonical_pk,
  d.small AS d_small,
  c.small AS c_small,
  d.type_line AS d_tl,
  c.type_line AS c_tl
FROM public.scryfall_cache d
JOIN LATERAL (
  SELECT trim(regexp_replace(d.name, '^\[\[(.*)\]\]$', '\1')) AS inner_raw
) b ON d.name ~ '^\[\[.+\]\]$'
JOIN public.scryfall_cache c
  ON lower(trim(b.inner_raw)) = lower(trim(c.name)) AND c.name <> d.name
WHERE (d.small IS NOT NULL AND c.small IS NULL)
   OR (d.normal IS NOT NULL AND c.normal IS NULL)
   OR (d.type_line IS NOT NULL AND c.type_line IS NULL)
LIMIT 100;
