-- =============================================================================
-- preview_scryfall_cache_final_small_bucket.sql
-- READ-ONLY PREVIEW (quoted_name, bracketed_name, import_set_number_junk)
-- Generated: 2026-03-28T15:42:33.949Z
-- merge_then_delete_bad_row: 0
-- rename_row_to_canonical: 0
-- skipped_sql: 0
-- =============================================================================

BEGIN;

-- Section A — Preview SELECTs
-- A1 — All small-bucket unmatched PKs (audit scope)

SELECT * FROM public.scryfall_cache WHERE name IN ('"[[bonus round]]"', '"[[storm-kiln artist]]"', '"sandy downvote"', '"settle the wreckage"', '"slippery eel"', '1,"ob nixilis, the hate-twisted', '1,"otawara, soaring city', '1,"shizo, death''s storehouse', 'brightclimb pathway (znr) 259');

-- A2 — PKs involved in merge/rename preview (subset)

-- (no merge/rename PKs — all high-confidence actions were unsure/keep_real)

-- Section B — Merge

-- Section C — Delete merged bad rows

-- Section D — Rename

ROLLBACK;
