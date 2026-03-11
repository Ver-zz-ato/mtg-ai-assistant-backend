-- Add legalities jsonb column to scryfall_cache for format legality lookups
ALTER TABLE IF EXISTS public.scryfall_cache 
  ADD COLUMN IF NOT EXISTS legalities jsonb DEFAULT NULL;

COMMENT ON COLUMN public.scryfall_cache.legalities IS 'Format legalities e.g. { "standard":"legal", "commander":"legal", "modern":"legal" }';
