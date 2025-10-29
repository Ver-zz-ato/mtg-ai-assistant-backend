-- ========================================
-- DIAGNOSE: Why Public Decks Show 404
-- This checks if data exists vs routing issue
-- ========================================

-- 1. Does the specific deck exist?
SELECT 
  '=== Checking Specific Deck: 09caacae-51ca-45d9-8f84-66bdc9abd94f ===' as step,
  id,
  title,
  commander,
  is_public,
  user_id,
  created_at
FROM decks 
WHERE id = '09caacae-51ca-45d9-8f84-66bdc9abd94f';

-- 2. How many public decks exist total?
SELECT 
  '=== Total Public Decks in Database ===' as step,
  COUNT(*) as total_public_decks
FROM decks 
WHERE is_public = true;

-- 3. Sample of public decks (to verify data is there)
SELECT 
  '=== Sample Public Decks (First 5) ===' as step,
  id,
  title,
  commander,
  is_public,
  created_at
FROM decks 
WHERE is_public = true 
ORDER BY created_at DESC 
LIMIT 5;

-- 4. Check RLS policies on decks table
SELECT 
  '=== RLS Status on Decks Table ===' as step,
  tablename,
  CASE WHEN rowsecurity THEN '✅ RLS ENABLED' ELSE '❌ RLS DISABLED' END as rls_status
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename = 'decks';

-- 5. List all policies on decks table
SELECT 
  '=== All RLS Policies on Decks Table ===' as step,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'decks'
ORDER BY policyname;

-- ========================================
-- DIAGNOSIS SUMMARY
-- ========================================
-- If the deck exists and is_public = true, then this is a:
--   ❌ FRONTEND ROUTING ISSUE (not a database issue)
-- 
-- If the deck doesn't exist or is_public = false, then:
--   ⚠️ DATA ISSUE (deck was deleted or made private)
--
-- If RLS is blocking access:
--   🔒 PERMISSION ISSUE (need to fix RLS policies)
-- ========================================

