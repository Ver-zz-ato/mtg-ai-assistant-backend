-- ========================================
-- COMPREHENSIVE SITE FUNCTIONALITY TEST
-- Verify nothing broke after security_definer fix
-- ========================================

-- 1. Test AI Usage Views (Analytics)
SELECT '=== Test 1: AI Usage Stats ===' as test;
SELECT 
  COUNT(*) as total_personas,
  SUM(messages) as total_messages,
  SUM(unique_users) as total_users
FROM ai_persona_usage_30d;
-- Expected: Should return aggregate numbers (even if 0)

-- 2. Test Daily AI Usage
SELECT '=== Test 2: Daily AI Stats ===' as test;
SELECT 
  COUNT(DISTINCT day) as days_tracked,
  COUNT(*) as total_rows
FROM ai_persona_usage_daily;
-- Expected: Should return numbers without errors

-- 3. Test Collection Card Enriched (Your Cards)
SELECT '=== Test 3: Your Collection Cards ===' as test;
SELECT 
  COUNT(*) as your_collection_cards,
  COUNT(DISTINCT collection_id) as your_collections
FROM collection_card_enriched;
-- Expected: Should return your card counts
-- If 0, that's OK if you have no collections

-- 4. Test Collection Card Details
SELECT '=== Test 4: Card Details with Scryfall Data ===' as test;
SELECT 
  name,
  type_line,
  rarity,
  color_identity
FROM collection_card_enriched 
LIMIT 3;
-- Expected: Should show your cards with Scryfall metadata
-- If empty, that's OK if you have no collection cards

-- 5. Test Public Collection Lookup
SELECT '=== Test 5: Public Collections ===' as test;
SELECT 
  COUNT(*) as public_collections,
  COUNT(DISTINCT collection_id) as unique_collections
FROM collection_public_lookup;
-- Expected: Should return counts of public collections

-- 6. Test You Can Still Query Your Own Collections
SELECT '=== Test 6: Your Collections Table ===' as test;
SELECT 
  id,
  name,
  created_at
FROM collections
WHERE user_id = auth.uid()
LIMIT 3;
-- Expected: Should show your collections
-- If empty, you might not have any collections

-- 7. Test You Can Still Query Your Collection Cards
SELECT '=== Test 7: Your Collection Cards Table ===' as test;
SELECT 
  cc.name,
  cc.qty,
  c.name as collection_name
FROM collection_cards cc
JOIN collections c ON c.id = cc.collection_id
WHERE c.user_id = auth.uid()
LIMIT 3;
-- Expected: Should show your cards
-- If empty, you might not have any cards in collections

-- 8. Test Public Collection Access (as authenticated user)
SELECT '=== Test 8: Can Access Public Collections ===' as test;
SELECT 
  c.id,
  c.name,
  cm.is_public
FROM collections c
JOIN collection_meta cm ON cm.collection_id = c.id
WHERE cm.is_public = true
LIMIT 3;
-- Expected: Should show public collections from any user

-- 9. Test AI Usage Table Direct Access
SELECT '=== Test 9: AI Usage Table ===' as test;
SELECT 
  COUNT(*) as your_ai_messages,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens
FROM ai_usage
WHERE user_id = auth.uid();
-- Expected: Should show your AI usage stats

-- 10. Final Summary
SELECT '=== ✅ FUNCTIONALITY TEST COMPLETE ===' as result;
SELECT 
  'If all queries returned results without errors, your site is working!' as status,
  'Empty results are OK if you have no data in those tables' as note;

