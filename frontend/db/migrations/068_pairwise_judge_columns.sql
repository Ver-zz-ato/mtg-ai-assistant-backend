-- Pairwise A/B: rubric-based judge winner and validator winner
-- Migration 068

ALTER TABLE ai_pairwise_results ADD COLUMN IF NOT EXISTS winner_by_validator text;
ALTER TABLE ai_pairwise_results ADD COLUMN IF NOT EXISTS winner_by_judge text;
ALTER TABLE ai_pairwise_results ADD COLUMN IF NOT EXISTS judge_confidence numeric;
ALTER TABLE ai_pairwise_results ADD COLUMN IF NOT EXISTS rubric_version text DEFAULT 'rubric_v1';

COMMENT ON COLUMN ai_pairwise_results.winner_by_validator IS 'Winner by validator score comparison (A/B/TIE). Kept for analysis.';
COMMENT ON COLUMN ai_pairwise_results.winner_by_judge IS 'Winner by rubric-based LLM judge. Primary decider.';
COMMENT ON COLUMN ai_pairwise_results.judge_confidence IS 'Judge confidence 0-1.';
COMMENT ON COLUMN ai_pairwise_results.rubric_version IS 'rubric_v1, etc.';
