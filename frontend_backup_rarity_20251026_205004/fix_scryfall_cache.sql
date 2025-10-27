-- Fix scryfall_cache table by adding missing columns
-- This adds the cmc and mana_cost columns that the application expects

BEGIN;

-- Add mana_cost field for mana cost information
ALTER TABLE scryfall_cache 
  ADD COLUMN IF NOT EXISTS mana_cost text;

-- Add cmc field for converted mana cost  
ALTER TABLE scryfall_cache 
  ADD COLUMN IF NOT EXISTS cmc integer DEFAULT 0;

-- Add comments to document the purpose of these fields
COMMENT ON COLUMN scryfall_cache.mana_cost IS 'Mana cost string like {2}{R}{G}';
COMMENT ON COLUMN scryfall_cache.cmc IS 'Converted mana cost as integer';

COMMIT;