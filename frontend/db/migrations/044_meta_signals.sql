-- Meta signals cache for discovery meta pages
-- Precomputed: trending, most-played, budget (commanders + cards)
-- Refreshed daily by meta-signals cron

CREATE TABLE IF NOT EXISTS meta_signals (
  signal_type text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE meta_signals IS 'Cached meta signals: trending-commanders, most-played-commanders, budget-commanders, trending-cards, most-played-cards.';

ALTER TABLE meta_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON meta_signals FOR SELECT USING (true);
