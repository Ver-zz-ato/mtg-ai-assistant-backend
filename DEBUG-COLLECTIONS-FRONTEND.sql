-- ========================================
-- DEBUG: What is the frontend actually seeing?
-- ========================================

-- 1. Verify RLS is DISABLED
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('collections', 'collection_cards', 'collection_meta');
-- Should show FALSE for all if RLS is disabled

-- 2. Test the EXACT query your frontend probably uses
SELECT 
  c.id,
  c.name,
  c.created_at,
  c.user_id,
  COUNT(cc.id) as card_count
FROM collections c
LEFT JOIN collection_cards cc ON cc.collection_id = c.id
WHERE c.user_id = auth.uid()
GROUP BY c.id, c.name, c.created_at, c.user_id;
-- This will return 0 because auth.uid() is NULL in SQL editor

-- 3. Test without auth (what it should return if RLS is disabled)
SELECT 
  c.id,
  c.name,
  c.created_at,
  c.user_id,
  COUNT(cc.id) as card_count
FROM collections c
LEFT JOIN collection_cards cc ON cc.collection_id = c.id
WHERE c.user_id = '990d69b2-3500-4833-81df-b05e07f929db'::uuid
GROUP BY c.id, c.name, c.created_at, c.user_id;
-- This should show your collections

-- 4. Check if view is being used instead
SELECT COUNT(*) as enriched_count FROM collection_card_enriched;
-- Should show 570

-- 5. CRITICAL: Check browser console
-- You need to check browser console for errors!

