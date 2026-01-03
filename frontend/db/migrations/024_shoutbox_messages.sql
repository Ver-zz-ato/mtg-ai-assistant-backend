-- Create shoutbox_messages table for persistent storage
CREATE TABLE IF NOT EXISTS shoutbox_messages (
  id BIGSERIAL PRIMARY KEY,
  user_name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_shoutbox_messages_created_at ON shoutbox_messages(created_at DESC);

-- Enable RLS
ALTER TABLE shoutbox_messages ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (public shoutbox)
CREATE POLICY "Anyone can read shoutbox messages"
  ON shoutbox_messages
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Allow anyone to insert (public shoutbox)
CREATE POLICY "Anyone can post shoutbox messages"
  ON shoutbox_messages
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);
