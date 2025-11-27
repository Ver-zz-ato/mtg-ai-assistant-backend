-- Add quality metrics to ai_test_cases table
-- These metrics help prioritize tests and identify high-value test cases

ALTER TABLE ai_test_cases 
  ADD COLUMN IF NOT EXISTS quality_score numeric DEFAULT 0;

ALTER TABLE ai_test_cases 
  ADD COLUMN IF NOT EXISTS failure_rate numeric DEFAULT 0;

ALTER TABLE ai_test_cases 
  ADD COLUMN IF NOT EXISTS last_passed_at timestamptz;

ALTER TABLE ai_test_cases 
  ADD COLUMN IF NOT EXISTS catch_count integer DEFAULT 0; -- How many bugs this test caught

ALTER TABLE ai_test_cases 
  ADD COLUMN IF NOT EXISTS consistency_score numeric DEFAULT 100; -- 0-100, higher = more consistent

ALTER TABLE ai_test_cases 
  ADD COLUMN IF NOT EXISTS run_count integer DEFAULT 0; -- Total number of times this test has been run

ALTER TABLE ai_test_cases 
  ADD COLUMN IF NOT EXISTS pass_count integer DEFAULT 0; -- Number of times this test passed

-- Create index for faster quality score queries
CREATE INDEX IF NOT EXISTS idx_ai_test_cases_quality_score ON ai_test_cases(quality_score DESC);

-- Create index for catch_count (high-value tests)
CREATE INDEX IF NOT EXISTS idx_ai_test_cases_catch_count ON ai_test_cases(catch_count DESC);



