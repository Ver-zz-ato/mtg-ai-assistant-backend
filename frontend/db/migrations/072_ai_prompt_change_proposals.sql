-- AI Prompt Change Proposals: approval-gated proposal system
-- Migration 072

-- ai_prompt_change_proposals: human approval required before adoption
CREATE TABLE IF NOT EXISTS ai_prompt_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  created_by text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
  kind text NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'deck_analysis')),
  active_prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE SET NULL,
  previous_prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE SET NULL,
  candidate_prompt_version_ids uuid[] NOT NULL DEFAULT '{}',
  recommended_prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE SET NULL,
  rationale_eli5 text NOT NULL DEFAULT '',
  rationale_full text NOT NULL DEFAULT '',
  diff_summary jsonb NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '{}',
  risk_assessment jsonb NOT NULL DEFAULT '{}',
  approval_notes text,
  approved_at timestamptz,
  rejected_at timestamptz,
  approved_prompt_version_id uuid REFERENCES prompt_versions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_change_proposals_status ON ai_prompt_change_proposals(status);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_change_proposals_created ON ai_prompt_change_proposals(created_at DESC);

-- Add status and created_from_proposal_id to prompt_versions (if columns don't exist)
ALTER TABLE prompt_versions ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('active', 'previous', 'candidate', 'archived'));
ALTER TABLE prompt_versions ADD COLUMN IF NOT EXISTS created_from_proposal_id uuid REFERENCES ai_prompt_change_proposals(id) ON DELETE SET NULL;

-- ai_dynamic_test_cases: deck-sample tests (TTL/retention managed)
CREATE TABLE IF NOT EXISTS ai_dynamic_test_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  deck_id uuid,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'deck_analysis' CHECK (type IN ('chat', 'deck_analysis')),
  input jsonb NOT NULL DEFAULT '{}',
  expected_checks jsonb,
  tags text[] DEFAULT '{}',
  source text NOT NULL DEFAULT 'auto_deck_sample',
  meta jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ai_dynamic_test_cases_source ON ai_dynamic_test_cases(source);
CREATE INDEX IF NOT EXISTS idx_ai_dynamic_test_cases_created ON ai_dynamic_test_cases(created_at DESC);

-- RLS
ALTER TABLE ai_prompt_change_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_dynamic_test_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_prompt_change_proposals_all" ON ai_prompt_change_proposals;
CREATE POLICY "ai_prompt_change_proposals_all" ON ai_prompt_change_proposals FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_dynamic_test_cases_all" ON ai_dynamic_test_cases;
CREATE POLICY "ai_dynamic_test_cases_all" ON ai_dynamic_test_cases FOR ALL USING (true) WITH CHECK (true);
