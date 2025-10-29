-- ========================================
-- ALTERNATIVE FIX: Use ALTER VIEW to remove security_barrier
-- This approach modifies existing views instead of recreating
-- ========================================

-- Method 1: Try ALTER VIEW first (fastest)
ALTER VIEW IF EXISTS public.ai_persona_usage_30d SET (security_barrier = false);
ALTER VIEW IF EXISTS public.ai_persona_usage_daily SET (security_barrier = false);
ALTER VIEW IF EXISTS public.collection_card_enriched SET (security_barrier = false);
ALTER VIEW IF EXISTS public.collection_public_lookup SET (security_barrier = false);

-- Verify Method 1 worked
SELECT 
  c.relname as view_name,
  CASE 
    WHEN c.reloptions::text ILIKE '%security_barrier%' THEN '❌ STILL HAS IT'
    ELSE '✅ FIXED'
  END as status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.relname IN (
    'collection_card_enriched',
    'ai_persona_usage_30d',
    'ai_persona_usage_daily',
    'collection_public_lookup'
  )
ORDER BY c.relname;

-- ========================================
-- If Method 1 didn't work, try Method 2: DROP CASCADE
-- ========================================
/*
-- Method 2: Nuclear option with CASCADE
DROP VIEW IF EXISTS public.ai_persona_usage_30d CASCADE;
DROP VIEW IF EXISTS public.ai_persona_usage_daily CASCADE;
DROP VIEW IF EXISTS public.collection_card_enriched CASCADE;
DROP VIEW IF EXISTS public.collection_public_lookup CASCADE;

-- Now recreate without security_barrier
CREATE VIEW public.ai_persona_usage_30d AS 
SELECT 
  COALESCE(NULLIF(persona_id, ''), 'unknown') AS persona_id,
  count(*) AS messages,
  sum(input_tokens) AS input_tokens,
  sum(output_tokens) AS output_tokens,
  round(sum(cost_usd), 6) AS cost_usd,
  count(DISTINCT user_id) AS unique_users
FROM ai_usage
WHERE created_at > (now() - INTERVAL '30 days')
GROUP BY COALESCE(NULLIF(persona_id, ''), 'unknown')
ORDER BY count(*) DESC;

CREATE VIEW public.ai_persona_usage_daily AS 
SELECT 
  date_trunc('day', created_at) AS day,
  COALESCE(NULLIF(persona_id, ''), 'unknown') AS persona_id,
  count(*) AS messages,
  sum(input_tokens) AS input_tokens,
  sum(output_tokens) AS output_tokens,
  round(sum(cost_usd), 6) AS cost_usd,
  count(DISTINCT user_id) AS unique_users
FROM ai_usage
GROUP BY date_trunc('day', created_at), COALESCE(NULLIF(persona_id, ''), 'unknown')
ORDER BY date_trunc('day', created_at) DESC, COALESCE(NULLIF(persona_id, ''), 'unknown');

CREATE VIEW public.collection_card_enriched AS 
SELECT 
  cc.id AS card_id,
  cc.collection_id,
  cc.name,
  cc.qty,
  cc.created_at,
  sc.type_line,
  sc.rarity,
  sc.set,
  sc.color_identity
FROM collection_cards cc
LEFT JOIN scryfall_cache sc ON sc.name = cc.name;

CREATE VIEW public.collection_public_lookup AS 
SELECT 
  c.id AS collection_id,
  cm.public_slug,
  cm.is_public
FROM collections c
JOIN collection_meta cm ON cm.collection_id = c.id
WHERE cm.public_slug IS NOT NULL
  AND cm.is_public = true;  -- Fixed: Only truly public collections

-- Grant permissions
GRANT SELECT ON public.ai_persona_usage_30d TO authenticated;
GRANT SELECT ON public.ai_persona_usage_daily TO authenticated;
GRANT SELECT ON public.collection_card_enriched TO authenticated;
GRANT SELECT ON public.collection_public_lookup TO authenticated, anon;

-- Final verification
SELECT 
  c.relname as view_name,
  CASE 
    WHEN c.reloptions::text ILIKE '%security_barrier%' THEN '❌ STILL HAS IT'
    ELSE '✅ FIXED'
  END as status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.relname IN (
    'collection_card_enriched',
    'ai_persona_usage_30d',
    'ai_persona_usage_daily',
    'collection_public_lookup'
  )
ORDER BY c.relname;
*/

-- ========================================
-- Test functionality after fix
-- ========================================
SELECT 'Testing views...' as status;
SELECT COUNT(*) as ai_usage_30d_rows FROM public.ai_persona_usage_30d;
SELECT COUNT(*) as ai_usage_daily_rows FROM public.ai_persona_usage_daily;
SELECT COUNT(*) as collection_card_enriched_rows FROM public.collection_card_enriched;
SELECT COUNT(*) as collection_public_lookup_rows FROM public.collection_public_lookup;
SELECT '✅ All views working!' as result;

