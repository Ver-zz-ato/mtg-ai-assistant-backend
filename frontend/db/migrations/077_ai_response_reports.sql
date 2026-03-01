-- AI Response Reports table for user-reported issues
-- Migration: 077_ai_response_reports.sql

CREATE TABLE IF NOT EXISTS ai_response_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  thread_id TEXT,
  message_id TEXT,
  ai_usage_id UUID,
  issue_types TEXT[] NOT NULL,
  description TEXT,
  ai_response_text TEXT,
  user_message_text TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_ai_response_reports_status ON ai_response_reports(status);
CREATE INDEX IF NOT EXISTS idx_ai_response_reports_created_at ON ai_response_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_response_reports_user_id ON ai_response_reports(user_id);

-- Enable RLS
ALTER TABLE ai_response_reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert reports (even anonymous users)
CREATE POLICY "Anyone can submit reports"
  ON ai_response_reports FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Only admins can read reports (enforced at API level, but RLS backup)
CREATE POLICY "Users can read their own reports"
  ON ai_response_reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow service role full access for admin operations
CREATE POLICY "Service role has full access"
  ON ai_response_reports FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
