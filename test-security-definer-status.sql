-- ========================================
-- TEST SECURITY DEFINER STATUS
-- Comprehensive check of what's actually happening
-- ========================================

-- 1. Check if views still have SECURITY DEFINER property
SELECT 
  c.relname as view_name,
  c.reloptions as options,
  CASE 
    WHEN c.reloptions::text ILIKE '%security_barrier%' THEN '❌ HAS SECURITY DEFINER'
    WHEN pg_get_viewdef(c.oid, true) ILIKE '%security_barrier%' THEN '❌ HAS SECURITY DEFINER (in definition)'
    ELSE '✅ NO SECURITY DEFINER'
  END as status,
  c.reloptions as raw_options
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

-- 2. Get full view definitions to see if security_barrier is there
SELECT 
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
    'collection_card_enriched',
    'ai_persona_usage_30d',
    'ai_persona_usage_daily',
    'collection_public_lookup'
  )
ORDER BY viewname;

-- 3. Check for any dependencies or materialized views
SELECT 
  c.relname as name,
  c.relkind as kind,
  CASE c.relkind
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    WHEN 'r' THEN 'TABLE'
    ELSE c.relkind::text
  END as type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE '%collection%'
  AND c.relkind IN ('v', 'm')
ORDER BY c.relname;

-- 4. Test if views are actually working
SELECT '=== Testing ai_persona_usage_30d ===' as test;
SELECT * FROM public.ai_persona_usage_30d LIMIT 2;

SELECT '=== Testing ai_persona_usage_daily ===' as test;
SELECT * FROM public.ai_persona_usage_daily LIMIT 2;

SELECT '=== Testing collection_card_enriched ===' as test;
SELECT * FROM public.collection_card_enriched LIMIT 2;

SELECT '=== Testing collection_public_lookup ===' as test;
SELECT * FROM public.collection_public_lookup LIMIT 2;

-- 5. Check if there are any OTHER views we missed
SELECT 
  c.relname as view_name,
  c.reloptions as options
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.reloptions::text ILIKE '%security_barrier%'
ORDER BY c.relname;

-- 6. Alternative fix - Explicitly set security_barrier to false
-- Run this if the above shows they still have security_barrier:
/*
ALTER VIEW public.ai_persona_usage_30d SET (security_barrier = false);
ALTER VIEW public.ai_persona_usage_daily SET (security_barrier = false);
ALTER VIEW public.collection_card_enriched SET (security_barrier = false);
ALTER VIEW public.collection_public_lookup SET (security_barrier = false);
*/

-- 7. Nuclear option - DROP CASCADE and recreate
-- Only run if ALTER VIEW doesn't work:
/*
DROP VIEW IF EXISTS public.ai_persona_usage_30d CASCADE;
DROP VIEW IF EXISTS public.ai_persona_usage_daily CASCADE;
DROP VIEW IF EXISTS public.collection_card_enriched CASCADE;
DROP VIEW IF EXISTS public.collection_public_lookup CASCADE;

-- Then re-run fix-security-definer-views-SIMPLE.sql
*/

