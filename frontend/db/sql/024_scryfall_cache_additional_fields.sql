-- 024_scryfall_cache_additional_fields.sql
-- Add missing fields to scryfall_cache for comprehensive card data
BEGIN;

-- Add mana_cost field for mana cost information
ALTER TABLE scryfall_cache 
  ADD COLUMN IF NOT EXISTS mana_cost text;

-- Add oracle_text field for card text/rules
ALTER TABLE scryfall_cache 
  ADD COLUMN IF NOT EXISTS oracle_text text;

-- Add type_line field for card types (already added in 023 but ensure it exists)
ALTER TABLE scryfall_cache 
  ADD COLUMN IF NOT EXISTS type_line text;

-- Add cmc field for converted mana cost
ALTER TABLE scryfall_cache 
  ADD COLUMN IF NOT EXISTS cmc integer DEFAULT 0;

-- Add comments to document the purpose of these fields
COMMENT ON COLUMN scryfall_cache.mana_cost IS 'Mana cost string like {2}{R}{G}';
COMMENT ON COLUMN scryfall_cache.oracle_text IS 'Card rules text for archetype analysis';
COMMENT ON COLUMN scryfall_cache.type_line IS 'Card type line like "Creature — Human Warrior"';
COMMENT ON COLUMN scryfall_cache.cmc IS 'Converted mana cost as integer';

COMMIT;