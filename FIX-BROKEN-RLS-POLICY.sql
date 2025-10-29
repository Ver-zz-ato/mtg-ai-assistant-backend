-- ========================================
-- FIX: Drop Broken RLS Policy on Decks Table
-- The "read_public_decks" policy references wrong column name
-- ========================================

-- This policy is broken: (public = true) 
-- Should be: (is_public = true)
DROP POLICY IF EXISTS "read_public_decks" ON decks;

-- Verify it's gone
SELECT 
  '=== Remaining RLS Policies on Decks ===' as check,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'decks'
ORDER BY policyname;

-- Note: We don't need to recreate it because we already have:
-- 1. "decks_public_read" - allows SELECT where (is_public = true) OR (auth.uid() = user_id)
-- 2. "read public decks" - allows SELECT where (is_public = true)
-- 3. "read_public_or_own" - allows SELECT where (is_public = true) OR (auth.uid() = user_id)
-- 
-- These 3 correct policies handle all public deck access scenarios.

SELECT '✅ Broken policy dropped! Public decks should work now.' as status;

