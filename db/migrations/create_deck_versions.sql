-- Create deck_versions table for Pro deck versioning
CREATE TABLE IF NOT EXISTS deck_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  deck_text TEXT NOT NULL,
  changes_summary TEXT,
  card_count INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_deck_versions_deck_id ON deck_versions(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_versions_created_at ON deck_versions(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deck_versions_deck_version ON deck_versions(deck_id, version_number);

-- Enable RLS
ALTER TABLE deck_versions ENABLE ROW LEVEL SECURITY;

-- Users can view versions of their own decks
CREATE POLICY "View own deck versions"
  ON deck_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM decks
      WHERE decks.id = deck_versions.deck_id
      AND decks.user_id = auth.uid()
    )
  );

-- Users can insert versions for their own decks
CREATE POLICY "Insert own deck versions"
  ON deck_versions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM decks
      WHERE decks.id = deck_versions.deck_id
      AND decks.user_id = auth.uid()
    )
  );

-- Users can delete their own deck versions
CREATE POLICY "Delete own deck versions"
  ON deck_versions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM decks
      WHERE decks.id = deck_versions.deck_id
      AND decks.user_id = auth.uid()
    )
  );

