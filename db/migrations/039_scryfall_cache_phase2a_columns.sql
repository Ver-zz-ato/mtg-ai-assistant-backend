-- Phase 2A: additive columns for public.scryfall_cache (identity, rules fields, derived type flags).
-- No destructive changes; existing columns unchanged.

ALTER TABLE IF EXISTS public.scryfall_cache
  ADD COLUMN IF NOT EXISTS name_norm text,
  ADD COLUMN IF NOT EXISTS colors text[],
  ADD COLUMN IF NOT EXISTS keywords text[],
  ADD COLUMN IF NOT EXISTS power text,
  ADD COLUMN IF NOT EXISTS toughness text,
  ADD COLUMN IF NOT EXISTS loyalty text,
  ADD COLUMN IF NOT EXISTS is_land boolean,
  ADD COLUMN IF NOT EXISTS is_creature boolean,
  ADD COLUMN IF NOT EXISTS is_instant boolean,
  ADD COLUMN IF NOT EXISTS is_sorcery boolean,
  ADD COLUMN IF NOT EXISTS is_enchantment boolean,
  ADD COLUMN IF NOT EXISTS is_artifact boolean,
  ADD COLUMN IF NOT EXISTS is_planeswalker boolean;

COMMENT ON COLUMN public.scryfall_cache.name_norm IS 'Same normalization as PK name (NFKD lowercase, trimmed); for indexed lookup.';
COMMENT ON COLUMN public.scryfall_cache.colors IS 'Scryfall card.colors (mana colors on front face).';
COMMENT ON COLUMN public.scryfall_cache.keywords IS 'Scryfall card.keywords.';
COMMENT ON COLUMN public.scryfall_cache.is_land IS 'Derived from type_line via word-boundary match; null if type_line missing.';

CREATE INDEX IF NOT EXISTS scryfall_cache_name_norm_idx ON public.scryfall_cache (name_norm);

-- Backfill name_norm from existing PK where missing (same value as name in production rows).
UPDATE public.scryfall_cache
SET name_norm = name
WHERE name_norm IS NULL AND name IS NOT NULL;
