-- ========================================
-- DIAGNOSE WHY COLLECTIONS DISAPPEARED
-- Run this AFTER the rollback to understand the issue
-- ========================================

-- 1. Check if your collections data still exists
SELECT 'Step 1: Raw collections table' as check;
SELECT id, name, user_id, created_at 
FROM collections 
WHERE user_id = '990d69b2-3500-4833-81df-b05e07f929db'
LIMIT 5;

-- 2. Check if RLS is blocking you
SELECT 'Step 2: Check RLS status' as check;
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('collections', 'collection_cards', 'collection_meta');

-- 3. Check what auth.uid() returns for you
SELECT 'Step 3: Your auth.uid()' as check;
SELECT auth.uid() as your_uid;

-- 4. Check if there's a mismatch
SELECT 'Step 4: User ID comparison' as check;
SELECT 
  '990d69b2-3500-4833-81df-b05e07f929db' as expected_user_id,
  auth.uid() as actual_auth_uid,
  CASE 
    WHEN auth.uid() = '990d69b2-3500-4833-81df-b05e07f929db'::uuid THEN '✅ MATCH'
    ELSE '❌ MISMATCH - This is the problem!'
  END as status;

-- 5. List all RLS policies on collections
SELECT 'Step 5: All policies on collections' as check;
SELECT 
  policyname,
  cmd,
  qual as using_expression
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'collections';

-- 6. Test if you can see collections with RLS disabled temporarily
SELECT 'Step 6: If we could disable RLS (admin only)' as check;
-- This would work but requires superuser:
-- SET SESSION AUTHORIZATION DEFAULT;
-- SELECT * FROM collections WHERE user_id = '990d69b2-3500-4833-81df-b05e07f929db';

-- 7. Check collection_card_enriched view after rollback
SELECT 'Step 7: Can you see cards after rollback?' as check;
SELECT COUNT(*) as card_count FROM collection_card_enriched;

