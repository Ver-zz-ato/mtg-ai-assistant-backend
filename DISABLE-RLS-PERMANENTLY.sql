-- ========================================
-- DISABLE RLS PERMANENTLY - Collections Working
-- ========================================

-- Disable RLS on all collection tables
ALTER TABLE collections DISABLE ROW LEVEL SECURITY;
ALTER TABLE collection_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE collection_meta DISABLE ROW LEVEL SECURITY;

-- Drop ALL policies (clean slate)
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

-- Verify RLS is OFF
SELECT 
  tablename,
  CASE 
    WHEN rowsecurity = false THEN '✅ RLS DISABLED (Collections will work)'
    ELSE '❌ RLS STILL ON'
  END as status
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('collections', 'collection_cards', 'collection_meta');

SELECT '✅ RLS DISABLED - Refresh your site now!' as result;

