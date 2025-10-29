-- ========================================
-- FULL ROLLBACK - RESTORE TO BEFORE SECURITY DEFINER FIX
-- This restores views + RLS to working state
-- Run this in Supabase SQL Editor NOW
-- ========================================

-- STEP 1: DIAGNOSTIC - What's broken?
SELECT '=== DIAGNOSTIC: Checking Current State ===' as step;

SELECT 
  'Public Decks Count' as check_type,
  COUNT(*) as count 
FROM decks 
WHERE is_public = true;

SELECT 
  'User Collections Count' as check_type,
  COUNT(*) as count 
FROM collections 
WHERE user_id = auth.uid();

SELECT 
  'RLS Status on Tables' as check_type,
  tablename,
  CASE WHEN rowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END as rls_status
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('decks', 'collections', 'collection_cards', 'collection_meta')
ORDER BY tablename;

-- STEP 2: RESTORE VIEWS WITH SECURITY BARRIER (closest to original SECURITY DEFINER)
SELECT '=== STEP 2: Restoring Views ===' as step;

-- Drop and recreate collection_card_enriched WITH security_barrier
DROP VIEW IF EXISTS public.collection_card_enriched CASCADE;
CREATE VIEW public.collection_card_enriched 
WITH (security_barrier = true) AS 
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

-- Drop and recreate collection_public_lookup WITH security_barrier
DROP VIEW IF EXISTS public.collection_public_lookup CASCADE;
CREATE VIEW public.collection_public_lookup 
WITH (security_barrier = true) AS 
SELECT 
  c.id AS collection_id,
  cm.public_slug,
  cm.is_public
FROM collections c
JOIN collection_meta cm ON cm.collection_id = c.id
WHERE cm.public_slug IS NOT NULL AND cm.is_public = true;

-- AI views (these were working fine without security_barrier)
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

-- Grant permissions
GRANT SELECT ON public.collection_card_enriched TO authenticated;
GRANT SELECT ON public.collection_public_lookup TO authenticated, anon;
GRANT SELECT ON public.ai_persona_usage_30d TO authenticated;
GRANT SELECT ON public.ai_persona_usage_daily TO authenticated;

-- STEP 3: RE-ENABLE RLS (if disabled) with SAFE policies
SELECT '=== STEP 3: Ensuring RLS is Properly Configured ===' as step;

-- Enable RLS on collection tables
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_meta ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies (clean slate)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'collections') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON collections';
    END LOOP;
    
    FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'collection_cards') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON collection_cards';
    END LOOP;
    
    FOR r IN (SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'collection_meta') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON collection_meta';
    END LOOP;
END $$;

-- Create SIMPLE, SAFE RLS policies for collections
CREATE POLICY "Users see own collections"
  ON collections
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users manage own collections"
  ON collections
  FOR ALL
  USING (user_id = auth.uid());

-- collection_cards policies
CREATE POLICY "Users see own collection cards"
  ON collection_cards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM collections 
      WHERE collections.id = collection_cards.collection_id 
      AND collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users manage own collection cards"
  ON collection_cards
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM collections 
      WHERE collections.id = collection_cards.collection_id 
      AND collections.user_id = auth.uid()
    )
  );

-- collection_meta policies
CREATE POLICY "Users see own collection meta"
  ON collection_meta
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM collections 
      WHERE collections.id = collection_meta.collection_id 
      AND collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users manage own collection meta"
  ON collection_meta
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM collections 
      WHERE collections.id = collection_meta.collection_id 
      AND collections.user_id = auth.uid()
    )
  );

-- Public read access for public collections (via the view)
CREATE POLICY "Public collections visible to all"
  ON collections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM collection_meta cm
      WHERE cm.collection_id = collections.id
      AND cm.is_public = true
    )
  );

-- STEP 4: VERIFY EVERYTHING WORKS
SELECT '=== STEP 4: FINAL VERIFICATION ===' as step;

SELECT 
  'Public Decks Count (After Fix)' as check_type,
  COUNT(*) as count 
FROM decks 
WHERE is_public = true;

SELECT 
  'Your Collections Count (After Fix)' as check_type,
  COUNT(*) as count 
FROM collections 
WHERE user_id = auth.uid();

SELECT 
  'Your Collection Cards (After Fix)' as check_type,
  COUNT(*) as count 
FROM collection_card_enriched 
WHERE collection_id IN (
  SELECT id FROM collections WHERE user_id = auth.uid()
);

SELECT 
  'RLS Status (After Fix)' as check_type,
  tablename,
  CASE WHEN rowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END as rls_status
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('decks', 'collections', 'collection_cards', 'collection_meta')
ORDER BY tablename;

-- FINAL CHECK: Test a sample public deck
SELECT 
  'Sample Public Deck' as check_type,
  id,
  title,
  commander,
  is_public
FROM decks 
WHERE is_public = true 
LIMIT 1;

SELECT '✅ ✅ ✅ ROLLBACK COMPLETE! ✅ ✅ ✅' as status;
SELECT 'Please refresh your site and check:' as action;
SELECT '1. Browse public decks page' as step_1;
SELECT '2. Your collections page' as step_2;
SELECT '3. AI chat functionality' as step_3;

