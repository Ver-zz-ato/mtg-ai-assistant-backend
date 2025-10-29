-- ========================================
-- FINAL FIX: Ensure auth.uid() works correctly
-- ========================================

-- STEP 1: Check RLS status
SELECT '=== Current RLS Status ===' as step;
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('collections', 'collection_cards', 'collection_meta');

-- STEP 2: DISABLE RLS completely for now (to make site work)
ALTER TABLE collections DISABLE ROW LEVEL SECURITY;
ALTER TABLE collection_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE collection_meta DISABLE ROW LEVEL SECURITY;

SELECT '=== RLS DISABLED - CHECK YOUR SITE NOW ===' as action;
SELECT 'Your collections should appear immediately after refresh' as note;

-- ========================================
-- IF COLLECTIONS APPEAR AFTER DISABLING RLS:
-- Then RLS policies were the problem
-- ========================================

-- STEP 3: Re-enable and fix properly (ONLY run if Step 2 worked)
/*
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_meta ENABLE ROW LEVEL SECURITY;

-- Drop ALL old policies
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

-- Create single, simple policy for collections
CREATE POLICY "collections_policy"
  ON collections
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Create policy for collection_cards
CREATE POLICY "collection_cards_policy"
  ON collection_cards
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collections 
      WHERE collections.id = collection_cards.collection_id 
      AND collections.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM collections 
      WHERE collections.id = collection_cards.collection_id 
      AND collections.user_id = auth.uid()
    )
  );

-- Create policy for collection_meta
CREATE POLICY "collection_meta_policy"
  ON collection_meta
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM collections 
      WHERE collections.id = collection_meta.collection_id 
      AND collections.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM collections 
      WHERE collections.id = collection_meta.collection_id 
      AND collections.user_id = auth.uid()
    )
  );

-- Add public read policies
CREATE POLICY "collections_public_read"
  ON collections
  FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM collection_meta 
      WHERE collection_meta.collection_id = collections.id 
      AND collection_meta.is_public = true
    )
  );

CREATE POLICY "collection_meta_public_read"
  ON collection_meta
  FOR SELECT
  TO authenticated, anon
  USING (is_public = true);

SELECT '=== Policies recreated - test your site ===' as done;
*/

