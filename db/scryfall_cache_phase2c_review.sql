-- =============================================================================
-- Phase 2C — REVIEW ONLY: identify likely junk in public.scryfall_cache
-- Run in Supabase SQL editor (or psql). Read-only; no mutations.
-- Evidence-based buckets; false positives possible — use Tier A/B/C in PHASE2C doc.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Q01 — Suspiciously long names (tune threshold after first run)
-- -----------------------------------------------------------------------------
SELECT name,
       length(name) AS len,
       type_line IS NOT NULL AS has_type,
       oracle_text IS NOT NULL AS has_oracle,
       small IS NOT NULL AS has_img
FROM public.scryfall_cache
WHERE length(name) > 200
ORDER BY length(name) DESC;

-- Count
SELECT count(*) AS q01_count_long_gt_200
FROM public.scryfall_cache
WHERE length(name) > 200;


-- -----------------------------------------------------------------------------
-- Q02 — Sentence-like: many whitespace-separated tokens (not “one-word is bad”)
-- -----------------------------------------------------------------------------
SELECT name,
       cardinality(regexp_split_to_array(trim(name), '\s+')) AS word_count,
       length(name) AS len,
       type_line IS NOT NULL AS has_type
FROM public.scryfall_cache
WHERE cardinality(regexp_split_to_array(trim(name), '\s+')) > 25
ORDER BY cardinality(regexp_split_to_array(trim(name), '\s+')) DESC;

SELECT count(*) AS q02_count_many_words_gt_25
FROM public.scryfall_cache
WHERE cardinality(regexp_split_to_array(trim(name), '\s+')) > 25;


-- -----------------------------------------------------------------------------
-- Q03 — Leading list / bullet / dash noise (aligned with sanitizeImageCacheInputName intent)
-- -----------------------------------------------------------------------------
SELECT name, length(name) AS len, type_line IS NOT NULL AS has_type
FROM public.scryfall_cache
WHERE name ~ '^[\s*•·‣⁃]+'
   OR name ~ '^[\-–—]\s+'
ORDER BY length(name) DESC;

SELECT count(*) AS q03_count_leading_markers
FROM public.scryfall_cache
WHERE name ~ '^[\s*•·‣⁃]+'
   OR name ~ '^[\-–—]\s+';


-- -----------------------------------------------------------------------------
-- Q04 — Trailing user-input punctuation (common junk from request keys)
-- -----------------------------------------------------------------------------
SELECT name, length(name) AS len
FROM public.scryfall_cache
WHERE name ~ '[\.,:;!?]+$'
ORDER BY length(name) DESC
LIMIT 500;

SELECT count(*) AS q04_count_trailing_punct
FROM public.scryfall_cache
WHERE name ~ '[\.,:;!?]+$';


-- -----------------------------------------------------------------------------
-- Q05 — Trailing dot only: candidates to pair with canonical row (repair vs delete)
-- -----------------------------------------------------------------------------
SELECT r.name AS junk_name,
       r.name ~ '\.$' AS ends_dot,
       c.name AS canonical_if_exists
FROM public.scryfall_cache r
LEFT JOIN public.scryfall_cache c
  ON c.name = regexp_replace(r.name, '\.$', '')
 AND c.name IS DISTINCT FROM r.name
WHERE r.name ~ '\.$'
ORDER BY length(r.name) DESC;

SELECT count(*) AS q05_trailing_dot_rows
FROM public.scryfall_cache
WHERE name ~ '\.$';


-- -----------------------------------------------------------------------------
-- Q06 — Prompt-like / URL-like substrings (high review; expect false positives low)
-- -----------------------------------------------------------------------------
SELECT name, length(name) AS len, type_line IS NOT NULL AS has_type
FROM public.scryfall_cache
WHERE name ~* '(https?://|www\.|explain|please |decklist|generate |analyze )'
   OR name LIKE '%?%'
ORDER BY length(name) DESC
LIMIT 200;

SELECT count(*) AS q06_promptish
FROM public.scryfall_cache
WHERE name ~* '(https?://|www\.|explain|please |decklist|generate |analyze )'
   OR name LIKE '%?%';


-- -----------------------------------------------------------------------------
-- Q07 — name vs name_norm drift (Phase 2A); should be rare if writers aligned
-- -----------------------------------------------------------------------------
SELECT name, name_norm
FROM public.scryfall_cache
WHERE name_norm IS NOT NULL
  AND name IS DISTINCT FROM name_norm
LIMIT 500;

SELECT count(*) AS q07_name_ne_name_norm
FROM public.scryfall_cache
WHERE name_norm IS NOT NULL
  AND name IS DISTINCT FROM name_norm;


-- -----------------------------------------------------------------------------
-- Q08 — Rows with almost no “card” metadata (image-only junk risk; many legit rows too)
-- NOT used for auto-delete alone — combine with Q01/Q02/Q06.
-- -----------------------------------------------------------------------------
SELECT name,
       length(name) AS len,
       type_line,
       oracle_text IS NOT NULL AS has_oracle,
       (set IS NOT NULL OR collector_number IS NOT NULL) AS has_printing
FROM public.scryfall_cache
WHERE type_line IS NULL
  AND oracle_text IS NULL
  AND (legalities IS NULL OR legalities = '{}'::jsonb)
ORDER BY length(name) DESC
LIMIT 200;

-- -----------------------------------------------------------------------------
-- Q09 — Summary: overlap bucket for “obvious junk” manual triage (adjust thresholds)
-- -----------------------------------------------------------------------------
SELECT count(*) AS q09_overlap_long_and_sparse
FROM public.scryfall_cache r
WHERE length(r.name) > 120
  AND cardinality(regexp_split_to_array(trim(r.name), '\s+')) > 8
  AND r.type_line IS NULL
  AND r.oracle_text IS NULL;
