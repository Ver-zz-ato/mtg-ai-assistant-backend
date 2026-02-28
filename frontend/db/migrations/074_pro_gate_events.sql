-- Migration: 074_pro_gate_events.sql
-- Store pro_gate_viewed and related funnel events for admin analytics

CREATE TABLE IF NOT EXISTS pro_gate_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,              -- pro_gate_viewed, pro_gate_clicked, pro_upgrade_started, pro_upgrade_completed
  pro_feature TEXT,                      -- which feature triggered the gate (e.g., hand_testing, export_deck_analysis)
  gate_location TEXT,                    -- where on the page (e.g., widget_display, header)
  source_path TEXT,                      -- URL path when event occurred
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_id TEXT,                       -- anonymous visitor tracking
  is_logged_in BOOLEAN,
  is_pro BOOLEAN,
  plan_suggested TEXT,                   -- monthly, annual
  reason TEXT,                           -- feature_required, limit_reached
  workflow_run_id TEXT,                  -- for linking upgrade funnel events
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pro_gate_events_type ON pro_gate_events(event_type);
CREATE INDEX IF NOT EXISTS idx_pro_gate_events_feature ON pro_gate_events(pro_feature);
CREATE INDEX IF NOT EXISTS idx_pro_gate_events_created ON pro_gate_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pro_gate_events_user ON pro_gate_events(user_id);
CREATE INDEX IF NOT EXISTS idx_pro_gate_events_visitor ON pro_gate_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_pro_gate_events_source ON pro_gate_events(source_path);

-- RLS: Only admins can read, system can insert
ALTER TABLE pro_gate_events ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for API inserts)
CREATE POLICY "Service role full access to pro_gate_events"
  ON pro_gate_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read (admin check done in API)
CREATE POLICY "Authenticated users can read pro_gate_events"
  ON pro_gate_events
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE pro_gate_events IS 'Tracks pro gate/paywall views and upgrade funnel for admin analytics';
