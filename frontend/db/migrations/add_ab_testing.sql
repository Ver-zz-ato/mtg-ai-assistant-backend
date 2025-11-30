-- A/B Testing Framework for Prompt Improvements

-- Create prompt_ab_tests table
CREATE TABLE IF NOT EXISTS prompt_ab_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_a_id UUID NOT NULL REFERENCES prompt_versions(id),
  variant_b_id UUID NOT NULL REFERENCES prompt_versions(id),
  traffic_split DECIMAL(3, 2) NOT NULL DEFAULT 0.5 CHECK (traffic_split >= 0 AND traffic_split <= 1),
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_prompt_variant table for consistent assignment
CREATE TABLE IF NOT EXISTS user_prompt_variant (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES prompt_ab_tests(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, test_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_prompt_ab_tests_status ON prompt_ab_tests(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_user_prompt_variant_user_id ON user_prompt_variant(user_id);
CREATE INDEX IF NOT EXISTS idx_user_prompt_variant_test_id ON user_prompt_variant(test_id);

-- Enable RLS
ALTER TABLE prompt_ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_prompt_variant ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active tests (for routing)
CREATE POLICY "Anyone can view active tests"
  ON prompt_ab_tests FOR SELECT
  USING (status = 'active');

-- Policy: Only admins can manage tests
CREATE POLICY "Admins can manage tests"
  ON prompt_ab_tests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Policy: Users can view their own variant assignments
CREATE POLICY "Users can view own variant"
  ON user_prompt_variant FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: System can insert variant assignments (via service role)
CREATE POLICY "System can insert variants"
  ON user_prompt_variant FOR INSERT
  WITH CHECK (true); -- Service role bypasses RLS

COMMENT ON TABLE prompt_ab_tests IS 'A/B tests for comparing prompt versions';
COMMENT ON TABLE user_prompt_variant IS 'Tracks which variant each user sees for consistent assignment';

