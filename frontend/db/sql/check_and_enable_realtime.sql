-- Check and Enable Supabase Real-Time for profiles table
-- Run this in Supabase SQL Editor

-- Step 1: Check current real-time status
SELECT 
  schemaname,
  tablename,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'profiles'
    ) THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as realtime_status
FROM pg_tables
WHERE schemaname = 'public' 
AND tablename = 'profiles';

-- Step 2: If disabled, enable real-time (uncomment to run)
-- ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- Step 3: Verify it's enabled (run after enabling)
-- SELECT 
--   schemaname,
--   tablename
-- FROM pg_publication_tables 
-- WHERE pubname = 'supabase_realtime' 
-- AND schemaname = 'public' 
-- AND tablename = 'profiles';

