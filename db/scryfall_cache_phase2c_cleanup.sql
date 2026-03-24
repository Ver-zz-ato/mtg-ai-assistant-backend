-- =============================================================================
-- Phase 2C — OPTIONAL cleanup (COMMENTED). Do not run whole file blindly.
-- Prerequisites: Phase 2B image-cache identity fix deployed; run REVIEW queries first.
-- Sections: REVIEW FIRST → SAFE UPDATES (high confidence) → SAFE DELETES (high confidence)
-- Copy ONE uncommented block at a time into the SQL editor; wrap in BEGIN; … ROLLBACK; for dry-run.
-- =============================================================================

-- =============================================================================
-- SECTION 0 — REVIEW FIRST (run scryfall_cache_phase2c_review.sql and spot-check)
-- =============================================================================
-- Confirm row counts per bucket; export CSV for audit if deleting > handful of rows.


-- =============================================================================
-- SECTION 1 — TIER A: SAFE UPDATES (canonical repair when duplicate exists)
-- Only when a row is a trivial punctuation/whitespace variant AND canonical PK exists.
-- MDFC / split cards: names contain " // "; do not strip " // " or merge across faces here.
-- =============================================================================

-- 1a) Trailing dot only, and base name exists as another row (e.g. "tiamat." vs "tiamat")
-- REVIEW: Oracle card names do not end with "." — still spot-check Q05 result first.
/*
DELETE FROM public.scryfall_cache r
USING public.scryfall_cache c
WHERE r.name ~ '\.$'
  AND c.name = regexp_replace(r.name, '\.$', '')
  AND c.name <> r.name
  AND r.name !~ ' // ';
*/

-- 1b) Leading "- " or hyphen dash + space only (not inner hyphens like "X-Files")
-- REVIEW: ensure Q03 list is only junk; legitimate names rarely start with "- ".
/*
DELETE FROM public.scryfall_cache r
USING public.scryfall_cache c
WHERE r.name ~ '^[\-–—]\s+'
  AND c.name = regexp_replace(r.name, '^[\-–—]\s+', '')
  AND c.name <> r.name
  AND c.name IS NOT NULL;
*/

-- 1c) Trim-only mismatch: name has leading/trailing spaces (PK should not)
-- REVIEW: if trimmed row already exists, delete the duplicate with spaces.
/*
DELETE FROM public.scryfall_cache r
USING public.scryfall_cache c
WHERE r.name <> btrim(r.name)
  AND c.name = btrim(r.name)
  AND c.name <> r.name;
*/


-- =============================================================================
-- SECTION 2 — TIER A: SAFE DELETES (very narrow — obvious non-card prompts)
-- Only if confidence is very high: long + many words + no rules text + no type line.
-- Does NOT delete rows solely for null set/collector_number.
-- =============================================================================

-- 2a) Extreme length + sentence-like + no card rules at all (prompt / paste garbage)
-- TUNE thresholds after Q01/Q02/Q09 counts.
/*
DELETE FROM public.scryfall_cache r
WHERE length(r.name) > 300
  AND cardinality(regexp_split_to_array(trim(r.name), '\s+')) > 15
  AND r.type_line IS NULL
  AND r.oracle_text IS NULL
  AND (r.legalities IS NULL OR r.legalities = '{}'::jsonb);
*/

-- 2b) Optional: same as 2a but allow image URLs (junk may still have cached images)
-- Uncomment only if 2a preview SELECT returns only garbage.

-- Preview for 2a (run as SELECT before DELETE):
/*
SELECT name, length(name), cardinality(regexp_split_to_array(trim(name), '\s+')) AS wc
FROM public.scryfall_cache r
WHERE length(r.name) > 300
  AND cardinality(regexp_split_to_array(trim(r.name), '\s+')) > 15
  AND r.type_line IS NULL
  AND r.oracle_text IS NULL
  AND (r.legalities IS NULL OR r.legalities = '{}'::jsonb);
*/


-- =============================================================================
-- SECTION 3 — TIER B: REVIEW NEEDED (do not automate — manual DELETE in SQL editor)
-- Examples: leading bullets where regexp_replace might collide with a real card;
--           Q06 prompt-like rows with short names; ambiguous duplicates.
-- =============================================================================


-- =============================================================================
-- SECTION 4 — TIER C: DO NOT TOUCH AUTOMATICALLY
-- - Rows with plausible type_line / oracle_text / legalities
-- - Short names (including one-word)
-- - MDFC "name // name" unless reviewed against Scryfall
-- - Null set/collector_number alone
-- =============================================================================
