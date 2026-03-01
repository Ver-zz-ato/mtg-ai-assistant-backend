-- Migration: Request Metrics for Billing Forensics
-- Stores sampled API request metrics to attribute Vercel costs.
-- Privacy: stores ip_prefix (first 2 octets) not full IP.

CREATE TABLE IF NOT EXISTS request_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  route text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  status int NOT NULL DEFAULT 200,
  duration_ms int NOT NULL DEFAULT 0,
  bytes_in int,
  bytes_out int,
  bot_flag boolean NOT NULL DEFAULT false,
  caller_type text, -- 'cron', 'health_check', 'bot', 'user', 'unknown'
  user_agent text,
  runtime text, -- 'nodejs', 'edge'
  region text,
  cache_status text,
  request_id text,
  ip_prefix text -- e.g. '192.168.x.x' for privacy
);

-- Index for time-range queries (most common)
CREATE INDEX IF NOT EXISTS idx_request_metrics_ts ON request_metrics(ts DESC);

-- Index for route aggregation
CREATE INDEX IF NOT EXISTS idx_request_metrics_route ON request_metrics(route);

-- Index for bot/caller filtering
CREATE INDEX IF NOT EXISTS idx_request_metrics_bot_flag ON request_metrics(bot_flag) WHERE bot_flag = true;
CREATE INDEX IF NOT EXISTS idx_request_metrics_caller_type ON request_metrics(caller_type);

-- Retention: auto-delete records older than 14 days
-- Run this via cron job or pg_cron if available
COMMENT ON TABLE request_metrics IS 'Sampled API request metrics for billing forensics. Auto-cleanup: delete WHERE ts < now() - interval ''14 days''';

-- Optional: Add a function to clean up old records (can be called from a cron API)
CREATE OR REPLACE FUNCTION cleanup_request_metrics(days_to_keep int DEFAULT 14)
RETURNS int AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM request_metrics WHERE ts < now() - (days_to_keep || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust to your Supabase setup)
-- Service role can insert; anon cannot access
ALTER TABLE request_metrics ENABLE ROW LEVEL SECURITY;

-- Only service role (admin) can read/write
CREATE POLICY "Service role full access" ON request_metrics
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
