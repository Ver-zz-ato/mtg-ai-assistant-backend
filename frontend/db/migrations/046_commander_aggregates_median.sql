-- Add median_deck_cost to commander_aggregates (Phase 4 extend)

ALTER TABLE commander_aggregates ADD COLUMN IF NOT EXISTS median_deck_cost numeric;

COMMENT ON COLUMN commander_aggregates.median_deck_cost IS 'Median deck cost (USD) for public decks with this commander. From deck_costs.';
