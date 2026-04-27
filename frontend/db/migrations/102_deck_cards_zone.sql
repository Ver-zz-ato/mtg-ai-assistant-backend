-- Phase 1: Per-row zone for mainboard / sideboard / commander (app-level).
-- Run manually against Supabase when ready. Do not apply automatically in CI.
--
-- Before: UNIQUE (deck_id, name) on deck_cards
-- After: UNIQUE (deck_id, name, zone) so the same card name can exist in main and side
--        with different quantities (e.g. after moving copies).
--
-- Existing rows: all become zone = 'mainboard' (column default).

ALTER TABLE public.deck_cards
  ADD COLUMN IF NOT EXISTS zone text NOT NULL DEFAULT 'mainboard';

COMMENT ON COLUMN public.deck_cards.zone IS
  'mainboard | sideboard | commander — enforced in app; Commander decks typically use mainboard only.';

-- Drop legacy unique on (deck_id, name) if present.
ALTER TABLE public.deck_cards DROP CONSTRAINT IF EXISTS deck_cards_deck_id_name_key;

-- Unique index: one row per (deck, name, zone)
CREATE UNIQUE INDEX IF NOT EXISTS deck_cards_deck_id_name_zone_key
  ON public.deck_cards (deck_id, name, zone);
