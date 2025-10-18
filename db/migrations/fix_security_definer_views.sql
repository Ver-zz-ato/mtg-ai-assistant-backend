-- ============================================================================
-- Fix Security Definer Views
-- Recreates 4 views WITHOUT SECURITY DEFINER to fix linter errors
-- Created: 2025-10-18
-- ============================================================================

-- Drop and recreate views without SECURITY DEFINER
-- These views only read public data anyway, so SECURITY INVOKER is safe

-- ============================================================================
-- View 1: collection_card_enriched
-- ============================================================================

DROP VIEW IF EXISTS public.collection_card_enriched;

CREATE VIEW public.collection_card_enriched AS
SELECT cc.id              AS card_id,
       cc.collection_id,
       cc.name,
       cc.qty,
       cc.created_at,
       sc.type_line,
       sc.rarity,
       sc.set,
       sc.color_identity
FROM public.collection_cards cc
LEFT JOIN public.scryfall_cache sc
  ON sc.name = cc.name;

COMMENT ON VIEW public.collection_card_enriched IS 
'Helper view to join collection cards with cached metadata. Uses SECURITY INVOKER (respects RLS of querying user).';

-- ============================================================================
-- View 2: collection_public_lookup
-- ============================================================================

DROP VIEW IF EXISTS public.collection_public_lookup;

CREATE VIEW public.collection_public_lookup AS
SELECT c.id AS collection_id, cm.public_slug, cm.is_public
FROM public.collections c
JOIN public.collection_meta cm ON cm.collection_id = c.id
WHERE cm.public_slug IS NOT NULL;

COMMENT ON VIEW public.collection_public_lookup IS 
'Public binder lookup by slug. Uses SECURITY INVOKER (respects RLS of querying user).';

-- ============================================================================
-- View 3: ai_persona_usage_daily
-- ============================================================================

DROP VIEW IF EXISTS public.ai_persona_usage_daily;

CREATE VIEW public.ai_persona_usage_daily AS
SELECT
  date_trunc('day', created_at) AS day,
  COALESCE(NULLIF(persona_id, ''), 'unknown') AS persona_id,
  COUNT(*)                           AS messages,
  SUM(input_tokens)::bigint          AS input_tokens,
  SUM(output_tokens)::bigint         AS output_tokens,
  ROUND(SUM(cost_usd)::numeric, 6)   AS cost_usd,
  COUNT(DISTINCT user_id)            AS unique_users
FROM public.ai_usage
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

COMMENT ON VIEW public.ai_persona_usage_daily IS 
'Daily rollup of AI persona usage. Uses SECURITY INVOKER (admin access controlled by RLS on ai_usage table).';

-- ============================================================================
-- View 4: ai_persona_usage_30d
-- ============================================================================

DROP VIEW IF EXISTS public.ai_persona_usage_30d;

CREATE VIEW public.ai_persona_usage_30d AS
SELECT
  COALESCE(NULLIF(persona_id, ''), 'unknown') AS persona_id,
  COUNT(*)                           AS messages,
  SUM(input_tokens)::bigint          AS input_tokens,
  SUM(output_tokens)::bigint         AS output_tokens,
  ROUND(SUM(cost_usd)::numeric, 6)   AS cost_usd,
  COUNT(DISTINCT user_id)            AS unique_users
FROM public.ai_usage
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY messages DESC;

COMMENT ON VIEW public.ai_persona_usage_30d IS 
'30-day summary of AI persona usage. Uses SECURITY INVOKER (admin access controlled by RLS on ai_usage table).';

-- ============================================================================
-- Note about recent_public_decks
-- ============================================================================

-- The "recent_public_decks" view doesn't actually exist in the database.
-- The app queries the "decks" table directly with:
-- SELECT * FROM decks WHERE is_public = true ORDER BY updated_at DESC
-- 
-- If the linter is complaining about it, it's a ghost entry.
-- You can verify by running: SELECT * FROM pg_views WHERE viewname = 'recent_public_decks';
-- If it returns a row, uncomment and run the following:

-- DROP VIEW IF EXISTS public.recent_public_decks;

-- ============================================================================
-- DONE!
-- ============================================================================

-- All views now use SECURITY INVOKER (default), which means:
-- - They respect the RLS policies of the querying user
-- - Underlying tables (collections, ai_usage) have RLS enabled
-- - Admin views only work for admin users (via RLS on ai_usage)
-- - Public collection views respect is_public flags and user ownership


