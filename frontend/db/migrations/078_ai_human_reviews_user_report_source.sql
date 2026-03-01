-- Add user_report and auto_escalation as valid sources for ai_human_reviews
-- Migration: 078_ai_human_reviews_user_report_source.sql

-- Drop the old constraint and recreate with new values
ALTER TABLE ai_human_reviews DROP CONSTRAINT IF EXISTS ai_human_reviews_source_check;

ALTER TABLE ai_human_reviews 
ADD CONSTRAINT ai_human_reviews_source_check 
CHECK (source IN ('production_sample', 'test_case_sample', 'user_report', 'auto_escalation'));
