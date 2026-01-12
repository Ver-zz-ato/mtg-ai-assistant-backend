-- SQL queries to run in Supabase SQL Editor to verify and clear test cases
-- Run these in the Supabase dashboard: SQL Editor

-- 1. Check total count
SELECT COUNT(*) as total_tests FROM ai_test_cases;

-- 2. Check breakdown by source
SELECT source, COUNT(*) as count 
FROM ai_test_cases 
GROUP BY source 
ORDER BY count DESC;

-- 3. See all sources (including NULL)
SELECT 
  COALESCE(source, '(null)') as source,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM ai_test_cases 
GROUP BY source 
ORDER BY count DESC;

-- 4. Delete ALL test results first (required due to foreign key)
DELETE FROM ai_test_results;

-- 5. Delete ALL test cases
DELETE FROM ai_test_cases;

-- 6. Verify deletion
SELECT COUNT(*) as remaining_tests FROM ai_test_cases;

-- 7. After re-import, verify only PDF tests exist
SELECT COUNT(*) as pdf_tests 
FROM ai_test_cases 
WHERE source = 'pdf_import_2025';
