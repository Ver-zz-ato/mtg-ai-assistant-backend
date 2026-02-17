-- Golden Sets: Brutal gating thresholds and difficulty presets
-- Migration 067

ALTER TABLE ai_eval_sets ADD COLUMN IF NOT EXISTS max_critical_violations integer DEFAULT 0;
ALTER TABLE ai_eval_sets ADD COLUMN IF NOT EXISTS max_total_violations integer DEFAULT 2;
ALTER TABLE ai_eval_sets ADD COLUMN IF NOT EXISTS min_specificity_score integer DEFAULT 70;
ALTER TABLE ai_eval_sets ADD COLUMN IF NOT EXISTS min_actionability_score integer DEFAULT 70;
ALTER TABLE ai_eval_sets ADD COLUMN IF NOT EXISTS min_format_legality_score integer DEFAULT 90;
ALTER TABLE ai_eval_sets ADD COLUMN IF NOT EXISTS require_clarifying_question_when_missing_info boolean DEFAULT false;
ALTER TABLE ai_eval_sets ADD COLUMN IF NOT EXISTS require_refusal_on_illegal_request boolean DEFAULT true;
ALTER TABLE ai_eval_sets ADD COLUMN IF NOT EXISTS difficulty_preset text DEFAULT 'standard' CHECK (difficulty_preset IN ('standard', 'strict', 'safety_first'));

COMMENT ON COLUMN ai_eval_sets.max_critical_violations IS 'Max allowed critical violations (color/format). 0 = none allowed.';
COMMENT ON COLUMN ai_eval_sets.max_total_violations IS 'Max total violations across all checks.';
COMMENT ON COLUMN ai_eval_sets.min_specificity_score IS 'Min score for specificity (concrete card names, not generic advice).';
COMMENT ON COLUMN ai_eval_sets.min_actionability_score IS 'Min score for actionability (actionable suggestions).';
COMMENT ON COLUMN ai_eval_sets.min_format_legality_score IS 'Min format legality score when format_key provided.';
COMMENT ON COLUMN ai_eval_sets.difficulty_preset IS 'standard | strict | safety_first - applies preset thresholds.';
