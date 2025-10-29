-- ========================================
-- CHECK SECURITY DEFINER VIEWS
-- Run this in Supabase SQL Editor to see what these views do
-- ========================================

-- 1. Get full view definitions
SELECT 
  schemaname, 
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

-- 2. Check if views have SECURITY DEFINER
SELECT 
  n.nspname as schema,
  c.relname as view_name,
  CASE 
    WHEN c.relrowsecurity THEN 'YES - Has RLS'
    ELSE 'NO'
  END as has_rls,
  pg_get_viewdef(c.oid, true) as full_definition
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

-- 3. Check what tables each view depends on
SELECT 
  dependent_view.relname as view_name,
  source_table.relname as depends_on_table,
  source_ns.nspname as table_schema
FROM pg_depend 
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid 
JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid 
JOIN pg_class as source_table ON pg_depend.refobjid = source_table.oid 
JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent_view.relnamespace
JOIN pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
WHERE dependent_view.relname IN (
    'collection_card_enriched',
    'ai_persona_usage_30d',
    'ai_persona_usage_daily',
    'collection_public_lookup'
  )
  AND source_table.relkind = 'r'
  AND dependent_ns.nspname = 'public'
ORDER BY dependent_view.relname, source_table.relname;

-- 4. Sample data from each view (to understand what they return)
-- Uncomment each one to test:

-- SELECT * FROM public.collection_card_enriched LIMIT 5;
-- SELECT * FROM public.ai_persona_usage_30d LIMIT 5;
-- SELECT * FROM public.ai_persona_usage_daily LIMIT 5;
-- SELECT * FROM public.collection_public_lookup LIMIT 5;

-- ========================================
-- BACKUP: Export current view definitions
-- Copy the output and save as backup-views.sql
-- ========================================
SELECT 
  'CREATE OR REPLACE VIEW ' || schemaname || '.' || viewname || ' AS ' || E'\n' || definition || ';' as create_statement
FROM pg_views 
WHERE schemaname = 'public'
  AND viewname IN (
    'collection_card_enriched',
    'ai_persona_usage_30d', 
    'ai_persona_usage_daily',
    'collection_public_lookup'
  )
ORDER BY viewname;

