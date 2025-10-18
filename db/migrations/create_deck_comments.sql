-- Create deck_comments table for public deck comments
CREATE TABLE IF NOT EXISTS deck_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  flagged BOOLEAN DEFAULT FALSE,
  flag_count INT DEFAULT 0
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_deck_comments_deck_id ON deck_comments(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_comments_user_id ON deck_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_deck_comments_created_at ON deck_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deck_comments_flagged ON deck_comments(flagged) WHERE flagged = TRUE;

-- Enable RLS
ALTER TABLE deck_comments ENABLE ROW LEVEL SECURITY;

-- Everyone can view comments on public decks
CREATE POLICY "View comments on public decks"
  ON deck_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decks
      WHERE decks.id = deck_comments.deck_id
      AND decks.is_public = TRUE
    )
  );

-- Logged-in users can insert comments on public decks
CREATE POLICY "Insert comments on public decks"
  ON deck_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM decks
      WHERE decks.id = deck_comments.deck_id
      AND decks.is_public = TRUE
    )
  );

-- Users can update their own comments
CREATE POLICY "Update own comments"
  ON deck_comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Delete own comments"
  ON deck_comments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Deck owners can delete comments on their decks
CREATE POLICY "Deck owners can delete comments"
  ON deck_comments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM decks
      WHERE decks.id = deck_comments.deck_id
      AND decks.user_id = auth.uid()
    )
  );

