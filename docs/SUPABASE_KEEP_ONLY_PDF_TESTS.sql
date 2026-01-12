-- SQL to keep ONLY pdf_import_2025 tests, delete everything else
-- Run this in Supabase SQL Editor if you want to keep only PDF-imported tests

-- 1. Delete test results for non-PDF tests (foreign key constraint)
DELETE FROM ai_test_results 
WHERE test_case_id IN (
  SELECT id FROM ai_test_cases WHERE source != 'pdf_import_2025'
);

-- 2. Delete non-PDF test cases
DELETE FROM ai_test_cases 
WHERE source != 'pdf_import_2025';

-- 3. Verify: Should show only PDF tests
SELECT 
  source,
  COUNT(*) as count
FROM ai_test_cases
GROUP BY source;

-- 4. Check total count (should be 32)
SELECT COUNT(*) as total FROM ai_test_cases;
