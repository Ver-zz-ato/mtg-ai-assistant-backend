-- Clear all existing AI test cases to prepare for PDF import
-- This migration removes all test cases from the database
-- The JSON file will be replaced separately

-- Delete all test cases from database
DELETE FROM ai_test_cases;

-- Reset sequence if using auto-increment (though we use UUIDs)
-- No need to reset since we use UUID primary keys
