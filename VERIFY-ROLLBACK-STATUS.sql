-- ========================================
-- VERIFY ROLLBACK WORKED COMPLETELY
-- ========================================

-- 1. Check if views have SECURITY DEFINER back
SELECT 
  c.relname as view_name,
  c.reloptions as options,
  CASE 
    WHEN c.reloptions::text ILIKE '%security_barrier%' THEN '✅ HAS SECURITY DEFINER (Good for collections)'
    ELSE '❌ MISSING SECURITY DEFINER'
  END as status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.relname IN (
    'collection_card_enriched',
    'collection_public_lookup'
  )
ORDER BY c.relname;

-- 2. Test direct table access
SELECT '=== Test 1: Your collections (raw table) ===' as test;
SELECT id, name, created_at 
FROM collections 
WHERE user_id = '990d69b2-3500-4833-81df-b05e07f929db'::uuid
LIMIT 5;

-- 3. Test through the view
SELECT '=== Test 2: Your cards (through view) ===' as test;
SELECT card_id, collection_id, name, qty
FROM collection_card_enriched
LIMIT 5;

-- 4. Test auth.uid() matches
SELECT '=== Test 3: Auth check ===' as test;
SELECT 
  auth.uid() as current_auth_uid,
  '990d69b2-3500-4833-81df-b05e07f929db'::uuid as expected_uid,
  CASE 
    WHEN auth.uid() = '990d69b2-3500-4833-81df-b05e07f929db'::uuid THEN '✅ MATCH'
    WHEN auth.uid() IS NULL THEN '❌ NOT LOGGED IN'
    ELSE '❌ DIFFERENT USER'
  END as status;

-- 5. Check what the frontend endpoint would return
SELECT '=== Test 4: What API would return ===' as test;
SELECT 
  c.id,
  c.name,
  c.user_id,
  COUNT(cc.id) as card_count
FROM collections c
LEFT JOIN collection_cards cc ON cc.collection_id = c.id
WHERE c.user_id = auth.uid()
GROUP BY c.id, c.name, c.user_id
LIMIT 5;

-- 6. Final summary
SELECT 
  (SELECT COUNT(*) FROM collections WHERE user_id = auth.uid()) as your_collections_count,
  (SELECT COUNT(*) FROM collection_card_enriched) as enriched_cards_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM collections WHERE user_id = auth.uid()) > 0 THEN '✅ Collections exist'
    ELSE '❌ No collections found'
  END as collections_status,
  CASE 
    WHEN (SELECT COUNT(*) FROM collection_card_enriched) > 0 THEN '✅ View working'
    ELSE '❌ View empty'
  END as view_status;

