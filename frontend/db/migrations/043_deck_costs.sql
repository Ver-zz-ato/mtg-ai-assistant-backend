-- Deck costs cache for discovery Phase 4+ (median deck cost)
-- Precomputed per deck: total_usd from deck_cards + price_cache
-- Refreshed by deck-costs cron; used by commander-aggregates and budget-commanders

CREATE TABLE IF NOT EXISTS deck_costs (
  deck_id uuid PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  total_usd numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deck_costs_deck_id ON deck_costs(deck_id);

COMMENT ON TABLE deck_costs IS 'Cached total deck cost (USD) per deck. Refreshed daily by cron.';
