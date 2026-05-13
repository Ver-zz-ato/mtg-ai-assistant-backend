-- Shared links: expiry for temporary AI artifacts + analysis snapshots.

ALTER TABLE roast_permalinks
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE roast_permalinks
SET expires_at = created_at + interval '7 days'
WHERE expires_at IS NULL;

ALTER TABLE roast_permalinks
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roast_permalinks_expires_at
  ON roast_permalinks(expires_at);

DROP POLICY IF EXISTS "Anyone can read roast permalinks by id" ON roast_permalinks;
CREATE POLICY "Anyone can read active roast permalinks by id"
  ON roast_permalinks FOR SELECT
  TO anon, authenticated
  USING (expires_at > now());

DO $$
BEGIN
  IF to_regclass('public.shared_health_reports') IS NOT NULL THEN
    ALTER TABLE shared_health_reports
      ADD COLUMN IF NOT EXISTS expires_at timestamptz;

    UPDATE shared_health_reports
    SET expires_at = created_at + interval '7 days'
    WHERE expires_at IS NULL;

    ALTER TABLE shared_health_reports
      ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days'),
      ALTER COLUMN expires_at SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_shared_health_reports_expires_at
      ON shared_health_reports(expires_at);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shared_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deck_id uuid REFERENCES decks(id) ON DELETE SET NULL,
  snapshot_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_shared_analysis_reports_user_id
  ON shared_analysis_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_analysis_reports_deck_id
  ON shared_analysis_reports(deck_id);
CREATE INDEX IF NOT EXISTS idx_shared_analysis_reports_expires_at
  ON shared_analysis_reports(expires_at);

ALTER TABLE shared_analysis_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own analysis shares"
  ON shared_analysis_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own analysis shares"
  ON shared_analysis_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
