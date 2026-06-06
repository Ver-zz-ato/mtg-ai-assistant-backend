-- Tournament Manager Commander pod player report/confirmation flow.

ALTER TABLE public.tournament_pods
  ADD COLUMN IF NOT EXISTS reported_winner_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reported_by_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disputed_by_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.tournament_pods
  DROP CONSTRAINT IF EXISTS tournament_pods_status_check;

ALTER TABLE public.tournament_pods
  ADD CONSTRAINT tournament_pods_status_check
  CHECK (status = ANY (ARRAY['pending','reported','confirmed','disputed']::text[]));

CREATE TABLE IF NOT EXISTS public.tournament_pod_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,
  pod_id uuid NOT NULL REFERENCES public.tournament_pods(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.tournament_participants(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action = ANY (ARRAY['confirm','dispute']::text[])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pod_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_pod_confirmations_tournament
  ON public.tournament_pod_confirmations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pod_confirmations_pod
  ON public.tournament_pod_confirmations(pod_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pod_confirmations_participant
  ON public.tournament_pod_confirmations(participant_id);

ALTER TABLE public.tournament_pod_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournament participants can read pod confirmations" ON public.tournament_pod_confirmations;
CREATE POLICY "Tournament participants can read pod confirmations"
  ON public.tournament_pod_confirmations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_pod_confirmations.tournament_id
        AND t.host_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_participants p
      WHERE p.tournament_id = tournament_pod_confirmations.tournament_id
        AND p.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.tournament_pod_confirmations TO authenticated;

ALTER TABLE public.tournament_pod_confirmations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'tournament_pod_confirmations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_pod_confirmations;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.tournament_pod_confirmations IS 'Per-player Commander pod result confirmations/disputes for Tournament Manager.';
COMMENT ON COLUMN public.tournament_pods.reported_winner_participant_id IS 'Player reported as winner before all podmates confirm.';
