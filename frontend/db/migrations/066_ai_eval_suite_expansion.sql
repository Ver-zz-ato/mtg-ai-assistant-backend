-- AI Test Suite Expansion: Golden Sets, Pairwise A/B, Mutations, Cost, Alerting, Human Review
-- Migration 066

-- ========== FEATURE 1: GOLDEN SET MODE ==========
CREATE TABLE IF NOT EXISTS ai_eval_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  type text NOT NULL CHECK (type IN ('golden_deck', 'golden_chat', 'mixed')) DEFAULT 'mixed',
  test_case_ids uuid[] DEFAULT '{}',
  strict boolean DEFAULT true,
  min_overall_score numeric DEFAULT 80,
  require_critical_violations_zero boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_eval_set_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_run_id bigint REFERENCES eval_runs(id) ON DELETE SET NULL,
  eval_set_id uuid REFERENCES ai_eval_sets(id) ON DELETE CASCADE,
  pass boolean NOT NULL,
  meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_eval_set_runs_eval_run ON ai_eval_set_runs(eval_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_eval_set_runs_eval_set ON ai_eval_set_runs(eval_set_id);

-- ========== FEATURE 2: PAIRWISE A/B EVAL ==========
CREATE TABLE IF NOT EXISTS ai_pairwise_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_run_id bigint REFERENCES eval_runs(id) ON DELETE SET NULL,
  test_case_id uuid REFERENCES ai_test_cases(id) ON DELETE SET NULL,
  prompt_a_id uuid,
  prompt_b_id uuid,
  response_a_text text,
  response_b_text text,
  judge jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_pairwise_results_eval_run ON ai_pairwise_results(eval_run_id);
CREATE INDEX IF NOT EXISTS idx_ai_pairwise_results_test_case ON ai_pairwise_results(test_case_id);

-- ========== FEATURE 3: FUZZ / MUTATION ==========
CREATE TABLE IF NOT EXISTS ai_test_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_test_case_id uuid REFERENCES ai_test_cases(id) ON DELETE CASCADE,
  mutated_test_case_id uuid REFERENCES ai_test_cases(id) ON DELETE CASCADE,
  mutation_type text NOT NULL,
  meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_test_mutations_base ON ai_test_mutations(base_test_case_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_mutations_mutated ON ai_test_mutations(mutated_test_case_id);

-- ========== FEATURE 4: COST + LATENCY - eval_run_id on ai_usage ==========
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS eval_run_id bigint NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS source text NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_eval_run_id ON public.ai_usage(eval_run_id) WHERE eval_run_id IS NOT NULL;
COMMENT ON COLUMN public.ai_usage.eval_run_id IS 'Links ai_usage to eval_runs for cost reporting. Set when AI test runs make LLM calls.';
COMMENT ON COLUMN public.ai_usage.source IS 'ai_test, ai_test_judge, production, etc.';

-- ========== FEATURE 5: ALERTING - webhook on schedules ==========
-- Ensure ai_test_schedules exists (may not have been created by add_test_schedules migration)
CREATE TABLE IF NOT EXISTS ai_test_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'custom')),
  cron_expression text,
  test_case_ids uuid[],
  validation_options jsonb DEFAULT '{}'::jsonb,
  alert_threshold numeric DEFAULT 70,
  alert_email text,
  enabled boolean DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_test_schedules_next_run ON ai_test_schedules(next_run_at) WHERE enabled = true;

ALTER TABLE ai_test_schedules ADD COLUMN IF NOT EXISTS alert_webhook_url text;
ALTER TABLE ai_test_schedules ADD COLUMN IF NOT EXISTS alert_on_golden_fail boolean DEFAULT true;
ALTER TABLE ai_test_schedules ADD COLUMN IF NOT EXISTS alert_on_regression boolean DEFAULT true;

-- ========== FEATURE 6: HUMAN REVIEW QUEUE ==========
CREATE TABLE IF NOT EXISTS ai_human_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  source text NOT NULL CHECK (source IN ('production_sample', 'test_case_sample')),
  route text,
  input jsonb DEFAULT '{}',
  output text,
  labels jsonb DEFAULT '{}',
  reviewer text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  meta jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ai_human_reviews_status ON ai_human_reviews(status);
CREATE INDEX IF NOT EXISTS idx_ai_human_reviews_source ON ai_human_reviews(source);
ALTER TABLE ai_human_reviews ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- RLS for new tables
ALTER TABLE ai_eval_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_eval_set_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pairwise_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_test_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_human_reviews ENABLE ROW LEVEL SECURITY;

-- RLS: Service role bypasses. For anon/key, allow all - API does isAdmin check.
DROP POLICY IF EXISTS "ai_eval_sets_all" ON ai_eval_sets;
CREATE POLICY "ai_eval_sets_all" ON ai_eval_sets FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_eval_set_runs_all" ON ai_eval_set_runs;
CREATE POLICY "ai_eval_set_runs_all" ON ai_eval_set_runs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_pairwise_results_all" ON ai_pairwise_results;
CREATE POLICY "ai_pairwise_results_all" ON ai_pairwise_results FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_test_mutations_all" ON ai_test_mutations;
CREATE POLICY "ai_test_mutations_all" ON ai_test_mutations FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_human_reviews_all" ON ai_human_reviews;
CREATE POLICY "ai_human_reviews_all" ON ai_human_reviews FOR ALL USING (true) WITH CHECK (true);
