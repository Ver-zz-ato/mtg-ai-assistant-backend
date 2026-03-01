-- Shoutbox Moderation: Add AI flag column and banned users table
-- Migration: 079_shoutbox_moderation.sql

-- Add is_ai_generated flag to existing shoutbox_messages table
ALTER TABLE shoutbox_messages ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

-- Create index for filtering AI messages
CREATE INDEX IF NOT EXISTS idx_shoutbox_messages_ai_generated ON shoutbox_messages(is_ai_generated);

-- Banned users table for shoutbox moderation
CREATE TABLE IF NOT EXISTS banned_shoutbox_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT NOT NULL,
  banned_at TIMESTAMPTZ DEFAULT NOW(),
  banned_by TEXT,
  reason TEXT,
  CONSTRAINT banned_shoutbox_users_unique_name UNIQUE (user_name)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_banned_shoutbox_users_name ON banned_shoutbox_users(user_name);

-- Enable RLS
ALTER TABLE banned_shoutbox_users ENABLE ROW LEVEL SECURITY;

-- Anyone can read banned users list (for checking before posting)
CREATE POLICY "Anyone can read banned users"
  ON banned_shoutbox_users FOR SELECT
  TO authenticated, anon
  USING (true);

-- Only service role can modify banned users (admin operations via API)
CREATE POLICY "Service role can manage banned users"
  ON banned_shoutbox_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add admin delete policy for shoutbox_messages (API enforces isAdmin check)
DROP POLICY IF EXISTS "Admin can delete shoutbox messages" ON shoutbox_messages;
CREATE POLICY "Admin can delete shoutbox messages"
  ON shoutbox_messages FOR DELETE
  TO authenticated
  USING (true);
