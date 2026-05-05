-- 041: Retire unused AI-test tables, replace old insecure backup staging tables with
-- locked-down backups, and remove PostgREST access to api_usage_rate_limits for anon/auth.
--
-- Notes:
-- - service_role bypasses RLS by default (used by trusted server/admin clients).
-- - After applying: deploy frontend change that writes rate limits using service_role.

BEGIN;

-- 1) Drop legacy AI-test tables (unused)
DROP TABLE IF EXISTS public.ai_test_results CASCADE;
DROP TABLE IF EXISTS public.ai_test_cases CASCADE;
DROP TABLE IF EXISTS public.ai_test_schedules CASCADE;

-- 2) Drop insecure backup staging tables (2026-03-28 snapshots)
DROP TABLE IF EXISTS public.scryfall_cache_backup_20260328 CASCADE;
DROP TABLE IF EXISTS public.scryfall_cache_backup_20260328_fullsafe CASCADE;
DROP TABLE IF EXISTS public.price_cache_backup_20260328 CASCADE;
DROP TABLE IF EXISTS public.price_snapshots_backup_20260328 CASCADE;
DROP TABLE IF EXISTS public.top_cards_backup_20260328 CASCADE;
DROP TABLE IF EXISTS public.card_embeddings_backup_20260328 CASCADE;

DROP TABLE IF EXISTS public.collection_cards_backup_20260328 CASCADE;
DROP TABLE IF EXISTS public.collection_items_backup_20260328 CASCADE;

DROP TABLE IF EXISTS public.watchlist_items_backup_20260328 CASCADE;
DROP TABLE IF EXISTS public.wishlist_items_backup_20260328 CASCADE;

DROP TABLE IF EXISTS public.deck_cards_backup_20260328 CASCADE;

DROP TABLE IF EXISTS public.scryfall_name_repair_map_20260328 CASCADE;

-- 3) Create fresh secured backups (schema copy + snapshot of current prod data at migration time)

CREATE TABLE IF NOT EXISTS public.scryfall_cache_backup_20260505 (LIKE public.scryfall_cache INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.price_cache_backup_20260505 (LIKE public.price_cache INCLUDING ALL);
CREATE TABLE IF NOT EXISTS public.price_snapshots_backup_20260505 (LIKE public.price_snapshots INCLUDING ALL);

INSERT INTO public.scryfall_cache_backup_20260505 SELECT * FROM public.scryfall_cache;
INSERT INTO public.price_cache_backup_20260505 SELECT * FROM public.price_cache;

-- NOTE: `price_snapshots` is intentionally NOT copied row-by-row here (can be TB-scale).
-- This migration creates an empty secured table you can selectively snapshot later via an admin-only job.

-- 4) Lock down new backup tables: RLS enabled (no policies) + revoke broad grants
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scryfall_cache_backup_20260505',
    'price_cache_backup_20260505',
    'price_snapshots_backup_20260505'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    -- Remove access for browser/API roles; keep service_role + owner-level operations.
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', t);
  END LOOP;
END $$;

-- 5) Lock down api_usage_rate_limits for PostgREST roles (server should use service_role)
ALTER TABLE IF EXISTS public.api_usage_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.api_usage_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_usage_rate_limits FROM PUBLIC;
REVOKE ALL ON TABLE public.api_usage_rate_limits FROM anon, authenticated;

-- If execute was granted broadly, tighten RPC surface as well:
REVOKE ALL ON FUNCTION public.increment_rate_limit(text, text, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, text, date, integer) TO service_role;

COMMIT;
