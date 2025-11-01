-- Fix infinite recursion in collections RLS policies
-- Problem: collection_meta policies query collections, and collections policy queries collection_meta

-- Step 1: Drop the problematic policy on collections that queries collection_meta
DROP POLICY IF EXISTS "Public collections visible to all" ON public.collections;

-- Step 2: Keep only the user-based policies on collections
-- (These already exist and work fine: "Users manage own collections", "Users see own collections")

-- Step 3: Verify collection_meta policies are fine (they already use collections.user_id which is efficient)
-- collection_meta policies query collections.user_id = auth.uid(), which is safe

-- After running this, collections will only be visible to:
-- 1. The owner (user_id = auth.uid())
-- 2. No public access (unless you add a different public policy later)

