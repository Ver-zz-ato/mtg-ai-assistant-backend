-- Preconstructed decks: official WotC Commander (and other) precons
-- Enables browsing and cloning precons on /decks/browse. Update via SQL as new sets release.

CREATE TABLE IF NOT EXISTS public.precon_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  commander text NOT NULL,
  colors text[] NOT NULL DEFAULT '{}',
  format text NOT NULL DEFAULT 'Commander',
  deck_text text NOT NULL DEFAULT '',
  set_name text NOT NULL,
  release_year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb DEFAULT '{}'
);

-- Index for filtering by set, year, commander
CREATE INDEX IF NOT EXISTS idx_precon_decks_set_name ON public.precon_decks(set_name);
CREATE INDEX IF NOT EXISTS idx_precon_decks_release_year ON public.precon_decks(release_year DESC);
CREATE INDEX IF NOT EXISTS idx_precon_decks_commander ON public.precon_decks(commander);
CREATE INDEX IF NOT EXISTS idx_precon_decks_colors ON public.precon_decks USING GIN(colors);

-- RLS: public read, no direct write from anon (admin uses service role)
ALTER TABLE public.precon_decks ENABLE ROW LEVEL SECURITY;

-- Anyone can read precons (no auth required)
CREATE POLICY "precon_decks_select" ON public.precon_decks
  FOR SELECT
  USING (true);

-- Only service role can insert/update/delete (for admin backfills)
-- No INSERT/UPDATE/DELETE policies = only service role bypasses RLS

COMMENT ON TABLE public.precon_decks IS 'Official WotC preconstructed decks. Browse at /decks/browse (Precons tab). Clone creates a user deck. Update via Supabase SQL as new sets release.';
