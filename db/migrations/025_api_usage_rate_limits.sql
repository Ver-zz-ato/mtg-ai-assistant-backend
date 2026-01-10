-- Migration 025: API Usage Rate Limits Table
-- Creates table for durable rate limiting that persists across server restarts
-- Complements in-memory rate limiting for better reliability

CREATE TABLE IF NOT EXISTS api_usage_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL, -- hash of user_id or guest_token (format: "user:xxx" or "guest:xxx")
  route_path TEXT NOT NULL, -- e.g., "/api/chat", "/api/deck/analyze"
  date DATE NOT NULL, -- Rate limit window (daily)
  request_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(key_hash, route_path, date)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_api_usage_key_date ON api_usage_rate_limits(key_hash, date);
CREATE INDEX IF NOT EXISTS idx_api_usage_route ON api_usage_rate_limits(route_path, date);
CREATE INDEX IF NOT EXISTS idx_api_usage_updated ON api_usage_rate_limits(updated_at);

-- Cleanup old entries (older than 7 days) - can be called by cron
-- DELETE FROM api_usage_rate_limits WHERE date < CURRENT_DATE - INTERVAL '7 days';
