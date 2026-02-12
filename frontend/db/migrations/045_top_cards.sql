-- Top cards cache for discovery card pages
-- Precomputed: top 200 cards by deck appearance
-- Refreshed daily by top-cards cron

CREATE TABLE IF NOT EXISTS top_cards (
  card_name text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  deck_count integer NOT NULL DEFAULT 0,
  commander_slugs jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE top_cards IS 'Top 200 cards by appearance in public decks. Refreshed daily.';

ALTER TABLE top_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON top_cards FOR SELECT USING (true);
