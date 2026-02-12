-- Commander aggregates cache for discovery Phase 4
-- Precomputed per commander: top cards, deck count, recent decks
-- Refreshed by cron; read by commander hub pages

CREATE TABLE IF NOT EXISTS commander_aggregates (
  commander_slug text PRIMARY KEY,
  top_cards jsonb NOT NULL DEFAULT '[]',
  deck_count integer NOT NULL DEFAULT 0,
  recent_decks jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE commander_aggregates IS 'Cached aggregates from public decks, keyed by commander slug. TTL ~24h.';
COMMENT ON COLUMN commander_aggregates.top_cards IS '[{ cardName, count, percent }] top 20 cards';
COMMENT ON COLUMN commander_aggregates.recent_decks IS '[{ id, title, updated_at }] 6 most recent';

-- Allow public read for SSR commander hub pages
ALTER TABLE commander_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON commander_aggregates FOR SELECT USING (true);
