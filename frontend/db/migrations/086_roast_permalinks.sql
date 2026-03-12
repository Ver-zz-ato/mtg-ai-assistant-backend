-- Roast permalinks: shareable links for logged-in users
CREATE TABLE IF NOT EXISTS roast_permalinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roast_text text NOT NULL,
  roast_score int,
  commander text,
  format text,
  roast_level text,
  commander_art_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roast_permalinks_user_id ON roast_permalinks(user_id);
CREATE INDEX IF NOT EXISTS idx_roast_permalinks_created_at ON roast_permalinks(created_at DESC);

-- RLS: users can insert their own, anyone can read by id
ALTER TABLE roast_permalinks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own roast permalinks"
  ON roast_permalinks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can read roast permalinks by id"
  ON roast_permalinks FOR SELECT
  TO anon, authenticated
  USING (true);
