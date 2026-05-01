-- Precons: allow unknown release years (was incorrectly filled with current year by sync parser).
-- Optional calendar date when matched to Scryfall set released_at.

ALTER TABLE public.precon_decks
  ALTER COLUMN release_year DROP NOT NULL;

ALTER TABLE public.precon_decks
  ADD COLUMN IF NOT EXISTS release_date date NULL;

CREATE INDEX IF NOT EXISTS idx_precon_decks_release_date ON public.precon_decks(release_date DESC NULLS LAST);

COMMENT ON COLUMN public.precon_decks.release_year IS 'Release year from deck title (YYYY), Scryfall set, or NULL if unknown.';
COMMENT ON COLUMN public.precon_decks.release_date IS 'Set release date from Scryfall released_at when matched; NULL if unknown.';
