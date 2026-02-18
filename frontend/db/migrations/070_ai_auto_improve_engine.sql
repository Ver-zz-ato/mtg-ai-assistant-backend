-- AI Auto-Improve Engine: prompt candidates, improvement reports, prompt history
-- Migration 070

-- ai_prompt_candidates: stores generated prompt variants (B, C) from auto-challenge
CREATE TABLE IF NOT EXISTS ai_prompt_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('chat', 'deck_analysis')),
  label text NOT NULL, -- 'current', 'B', 'C'
  system_prompt text NOT NULL,
  prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE SET NULL,
  meta jsonb DEFAULT '{}', -- source run, win_rate, golden_pass, cost_delta
  auto_challenge_run_id bigint REFERENCES eval_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_candidates_kind ON ai_prompt_candidates(kind);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_candidates_auto_challenge ON ai_prompt_candidates(auto_challenge_run_id);

-- ai_improvement_reports: ELI5 summaries after auto-improvement
CREATE TABLE IF NOT EXISTS ai_improvement_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('chat', 'deck_analysis')),
  what_changed text,
  why text,
  what_improved text,
  risk text,
  meta jsonb DEFAULT '{}', -- golden_pass, pass_rate_before, pass_rate_after, cost_delta
  prompt_version_before text,
  prompt_version_after text,
  eval_run_id bigint REFERENCES eval_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_improvement_reports_kind ON ai_improvement_reports(kind);
CREATE INDEX IF NOT EXISTS idx_ai_improvement_reports_created ON ai_improvement_reports(created_at DESC);

-- ai_prompt_history: tracks adoptions and rollbacks for audit
CREATE TABLE IF NOT EXISTS ai_prompt_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('chat', 'deck_analysis')),
  action text NOT NULL CHECK (action IN ('adopt', 'rollback')),
  prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE SET NULL,
  previous_prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE SET NULL,
  reason text,
  test_evidence jsonb DEFAULT '{}', -- win_rate_delta, golden_status, cost_delta
  meta jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_history_kind ON ai_prompt_history(kind);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_history_created ON ai_prompt_history(created_at DESC);

-- RLS
ALTER TABLE ai_prompt_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_improvement_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_prompt_candidates_all" ON ai_prompt_candidates;
CREATE POLICY "ai_prompt_candidates_all" ON ai_prompt_candidates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_improvement_reports_all" ON ai_improvement_reports;
CREATE POLICY "ai_improvement_reports_all" ON ai_improvement_reports FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_prompt_history_all" ON ai_prompt_history;
CREATE POLICY "ai_prompt_history_all" ON ai_prompt_history FOR ALL USING (true) WITH CHECK (true);
