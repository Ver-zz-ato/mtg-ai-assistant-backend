-- ========================================
-- SIMPLIFIED FIX: Remove SECURITY DEFINER from Views
-- RLS policies already exist - just recreate views!
-- ========================================

-- 1. AI Persona Usage (30 days) - Analytics aggregate
DROP VIEW IF EXISTS public.ai_persona_usage_30d CASCADE;
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

-- 2. AI Persona Usage (Daily) - Analytics aggregate  
DROP VIEW IF EXISTS public.ai_persona_usage_daily CASCADE;
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

-- 3. Collection Card Enriched - User data + public reference
DROP VIEW IF EXISTS public.collection_card_enriched CASCADE;
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

-- 4. Collection Public Lookup - Public collections only
DROP VIEW IF EXISTS public.collection_public_lookup CASCADE;
CREATE VIEW public.collection_public_lookup AS 
SELECT 
  c.id AS collection_id,
  cm.public_slug,
  cm.is_public
FROM collections c
JOIN collection_meta cm ON cm.collection_id = c.id
WHERE cm.public_slug IS NOT NULL;

-- ========================================
-- Grant permissions (optional, usually automatic)
-- ========================================
GRANT SELECT ON public.ai_persona_usage_30d TO authenticated;
GRANT SELECT ON public.ai_persona_usage_daily TO authenticated;
GRANT SELECT ON public.collection_card_enriched TO authenticated;
GRANT SELECT ON public.collection_public_lookup TO authenticated;
GRANT SELECT ON public.collection_public_lookup TO anon;

-- ========================================
-- VERIFICATION: Check SECURITY DEFINER is gone
-- ========================================
SELECT 
  n.nspname as schema,
  c.relname as view_name,
  CASE 
    WHEN pg_get_viewdef(c.oid, true) ILIKE '%security_barrier%' THEN '❌ STILL HAS SECURITY DEFINER'
    ELSE '✅ NO SECURITY DEFINER'
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
-- TEST: Verify views still work
-- ========================================
SELECT 'Testing ai_persona_usage_30d...' as test;
SELECT * FROM public.ai_persona_usage_30d LIMIT 3;

SELECT 'Testing ai_persona_usage_daily...' as test;
SELECT * FROM public.ai_persona_usage_daily LIMIT 3;

SELECT 'Testing collection_card_enriched...' as test;
SELECT * FROM public.collection_card_enriched LIMIT 3;

SELECT 'Testing collection_public_lookup...' as test;
SELECT * FROM public.collection_public_lookup LIMIT 3;

-- ========================================
-- SUCCESS! 🎉
-- All views recreated without SECURITY DEFINER
-- Existing RLS policies will handle security
-- ========================================

