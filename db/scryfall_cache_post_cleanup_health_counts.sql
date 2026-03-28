-- =============================================================================
-- scryfall_cache_post_cleanup_health_counts.sql
-- READ-ONLY aggregates for post-cleanup monitoring (no writes).
-- Run in Supabase SQL editor or psql.
--
-- Heuristic buckets (false positives possible): tune regex after sampling.
-- See: docs/SCRYFALL_CACHE_POST_CLEANUP_VERIFICATION.md
-- =============================================================================

-- Single row of summary metrics
SELECT
  (SELECT count(*)::bigint FROM public.scryfall_cache) AS total_rows,

  -- 1) name_norm must track PK for normalized cache rows
  (SELECT count(*)::bigint
   FROM public.scryfall_cache
   WHERE name IS DISTINCT FROM name_norm
      OR name_norm IS NULL) AS name_norm_drift_count,

  -- 2) Bracket / quote–style junk (leading quote, wiki brackets, etc.)
  (SELECT count(*)::bigint
   FROM public.scryfall_cache
   WHERE trim(name) LIKE '"%'
      OR name LIKE '''%'
      OR name LIKE '%[[%') AS bracket_quote_junk_count,

  -- 3) Set-code / collector-number suffix junk (e.g. " ... (znr) 259", promo p-codes)
  (SELECT count(*)::bigint
   FROM public.scryfall_cache
   WHERE name ~ ' \([a-z0-9]{3,5}\) [0-9]+[p★]*\s*$'::text
      OR name ~ ' \(p[a-z]{3,4}\) [0-9]'::text) AS set_collector_junk_count,

  -- 4) Leading quantity / CSV-style junk (e.g. 1,"card...)
  (SELECT count(*)::bigint
   FROM public.scryfall_cache
   WHERE name ~ '^[0-9]+,'::text
      OR name ~ '^[0-9]+x[0-9]+,'::text) AS leading_quantity_csv_junk_count;
