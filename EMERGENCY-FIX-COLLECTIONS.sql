-- ========================================
-- EMERGENCY FIX: RESTORE COLLECTIONS ACCESS
-- ========================================

-- STEP 1: Verify your collections data exists
SELECT '=== Step 1: Your collections data ===' as step;
SELECT 
  id,
  name,
  user_id,
  created_at
FROM collections 
WHERE user_id = '990d69b2-3500-4833-81df-b05e07f929db'::uuid
ORDER BY created_at DESC
LIMIT 5;
-- If this shows 0 rows, your data is gone (unlikely)
-- If this shows rows, data exists but RLS is blocking it

-- STEP 2: Temporarily disable ALL RLS on collections to test
ALTER TABLE collections DISABLE ROW LEVEL SECURITY;
ALTER TABLE collection_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE collection_meta DISABLE ROW LEVEL SECURITY;

-- STEP 3: Test if collections show now (refresh your site)
SELECT '=== Step 2: RLS disabled - test your site NOW ===' as step;
SELECT 'Go to your site and check if collections appear' as action;
SELECT 'If they appear, RLS policies are the problem' as diagnosis;

-- WAIT - Check your site now!
-- Come back and tell me if collections show up

-- STEP 4: If collections show, we know it's RLS
-- Re-enable RLS but with PROPER policies
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_meta ENABLE ROW LEVEL SECURITY;

-- STEP 5: Drop ALL existing policies (they're conflicting)
DROP POLICY IF EXISTS "Users can insert their own collections" ON collections;
DROP POLICY IF EXISTS "Users can see own or public collections" ON collections;
DROP POLICY IF EXISTS "delete own collections" ON collections;
DROP POLICY IF EXISTS "insert own collections" ON collections;
DROP POLICY IF EXISTS "read own collections" ON collections;
DROP POLICY IF EXISTS "update own collections" ON collections;

-- STEP 6: Create ONE SIMPLE policy for collections
CREATE POLICY "users_all_own_collections"
  ON collections
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- STEP 7: Fix collection_cards policies
DROP POLICY IF EXISTS "Users can only see their own collection cards" ON collection_cards;
DROP POLICY IF EXISTS "collection_cards_del_own" ON collection_cards;
DROP POLICY IF EXISTS "collection_cards_ins_own" ON collection_cards;
DROP POLICY IF EXISTS "collection_cards_sel_own" ON collection_cards;
DROP POLICY IF EXISTS "collection_cards_upd_own" ON collection_cards;

CREATE POLICY "users_all_own_collection_cards"
  ON collection_cards
  FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM collections WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    collection_id IN (
      SELECT id FROM collections WHERE user_id = auth.uid()
    )
  );

-- STEP 8: Fix collection_meta policies  
DROP POLICY IF EXISTS "Users can see own or public collection meta" ON collection_meta;
DROP POLICY IF EXISTS "owner_delete" ON collection_meta;
DROP POLICY IF EXISTS "owner_update" ON collection_meta;
DROP POLICY IF EXISTS "owner_write" ON collection_meta;
DROP POLICY IF EXISTS "public_read" ON collection_meta;

CREATE POLICY "users_all_own_collection_meta"
  ON collection_meta
  FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM collections WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    collection_id IN (
      SELECT id FROM collections WHERE user_id = auth.uid()
    )
  );

-- STEP 9: Also allow PUBLIC reads
CREATE POLICY "public_read_collections"
  ON collections
  FOR SELECT
  USING (
    id IN (
      SELECT collection_id FROM collection_meta WHERE is_public = true
    )
  );

CREATE POLICY "public_read_collection_meta"
  ON collection_meta
  FOR SELECT
  USING (is_public = true);

-- STEP 10: Final test
SELECT '=== Step 3: Policies fixed - test your site again ===' as step;
SELECT 'Refresh and check if collections appear now' as action;

