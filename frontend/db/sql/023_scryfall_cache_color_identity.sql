-- 023_scryfall_cache_color_identity.sql
-- Add color_identity field to scryfall_cache for better profile stats caching
BEGIN;

ALTER TABLE scryfall_cache 
  ADD COLUMN IF NOT EXISTS color_identity text[]; -- Store as string array ['W', 'U', etc.]

-- Provide a comment to make the purpose clear
COMMENT ON COLUMN scryfall_cache.color_identity IS 'Card color identity for use in profile trends and collection stats';

COMMIT;