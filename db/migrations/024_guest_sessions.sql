-- Migration 024: Guest Sessions Table
-- Creates table for server-side guest message tracking with signed tokens
-- Prevents client-side manipulation of guest limits

CREATE TABLE IF NOT EXISTS guest_sessions (
  token_hash TEXT PRIMARY KEY,
  message_count INTEGER DEFAULT 0,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Indexes for efficient lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_guest_sessions_expires ON guest_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_token ON guest_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_last_message ON guest_sessions(last_message_at);

-- Cleanup function to remove expired sessions (can be called by cron)
-- DELETE FROM guest_sessions WHERE expires_at < NOW();
