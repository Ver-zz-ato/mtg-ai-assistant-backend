-- Tournament Manager overall winner declaration.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS overall_winner_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_overall_winner
  ON public.tournaments(overall_winner_participant_id)
  WHERE overall_winner_participant_id IS NOT NULL;

COMMENT ON COLUMN public.tournaments.overall_winner_participant_id IS
  'Host-declared overall tournament winner; nullable until host chooses one.';
