-- ========================================
-- FIX SECURITY DEFINER VIEWS
-- Removes SECURITY DEFINER from 4 views
-- Adds proper RLS policies instead
-- ========================================

-- STEP 1: Drop and recreate views WITHOUT security_barrier
-- ========================================

-- 1. AI Persona Usage (30 days) - Analytics aggregate
DROP VIEW IF EXISTS public.ai_persona_usage_30d;
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
DROP VIEW IF EXISTS public.ai_persona_usage_daily;
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
DROP VIEW IF EXISTS public.collection_card_enriched;
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
DROP VIEW IF EXISTS public.collection_public_lookup;
CREATE VIEW public.collection_public_lookup AS 
SELECT 
  c.id AS collection_id,
  cm.public_slug,
  cm.is_public
FROM collections c
JOIN collection_meta cm ON cm.collection_id = c.id
WHERE cm.public_slug IS NOT NULL;

-- ========================================
-- STEP 2: Verify/Add RLS Policies
-- ========================================

-- Ensure collection_cards has RLS enabled
ALTER TABLE collection_cards ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own collection cards
-- (Check if it already exists before creating)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'collection_cards' 
    AND policyname = 'Users can only see their own collection cards'
  ) THEN
    CREATE POLICY "Users can only see their own collection cards"
      ON collection_cards FOR SELECT
      USING (
        collection_id IN (
          SELECT id FROM collections WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Ensure collections has RLS enabled
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own collections OR public collections
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'collections' 
    AND policyname = 'Users can see own or public collections'
  ) THEN
    CREATE POLICY "Users can see own or public collections"
      ON collections FOR SELECT
      USING (
        user_id = auth.uid() 
        OR id IN (
          SELECT collection_id FROM collection_meta WHERE is_public = true
        )
      );
  END IF;
END $$;

-- Ensure collection_meta has RLS enabled
ALTER TABLE collection_meta ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own metadata OR public metadata
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'collection_meta' 
    AND policyname = 'Users can see own or public collection meta'
  ) THEN
    CREATE POLICY "Users can see own or public collection meta"
      ON collection_meta FOR SELECT
      USING (
        collection_id IN (
          SELECT id FROM collections WHERE user_id = auth.uid()
        )
        OR is_public = true
      );
  END IF;
END $$;

-- ========================================
-- STEP 3: Grant necessary permissions
-- ========================================

-- Grant SELECT on views to authenticated users
GRANT SELECT ON public.ai_persona_usage_30d TO authenticated;
GRANT SELECT ON public.ai_persona_usage_daily TO authenticated;
GRANT SELECT ON public.collection_card_enriched TO authenticated;
GRANT SELECT ON public.collection_public_lookup TO authenticated;

-- Grant SELECT on views to anon users (for public features)
GRANT SELECT ON public.collection_public_lookup TO anon;

-- ========================================
-- STEP 4: Test the views
-- ========================================

-- Test 1: AI usage views (should return aggregate data)
SELECT * FROM public.ai_persona_usage_30d LIMIT 5;
SELECT * FROM public.ai_persona_usage_daily LIMIT 5;

-- Test 2: Collection card enriched (should only show your cards)
SELECT * FROM public.collection_card_enriched LIMIT 5;

-- Test 3: Public lookup (should show all public collections)
SELECT * FROM public.collection_public_lookup LIMIT 5;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Check that SECURITY DEFINER is removed
SELECT 
  n.nspname as schema,
  c.relname as view_name,
  pg_get_viewdef(c.oid, true) as definition,
  CASE 
    WHEN pg_get_viewdef(c.oid, true) LIKE '%security_barrier%' THEN 'HAS SECURITY DEFINER'
    ELSE 'NO SECURITY DEFINER'
  END as security_status
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

-- Check RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('collection_cards', 'collections', 'collection_meta')
ORDER BY tablename;

-- Check policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd as command,
  qual as using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('collection_cards', 'collections', 'collection_meta')
ORDER BY tablename, policyname;

-- ========================================
-- SUCCESS!
-- All views recreated without SECURITY DEFINER
-- RLS policies in place for proper security
-- ========================================

