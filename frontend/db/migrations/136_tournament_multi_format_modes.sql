-- Tournament Manager multi-format support: elimination, round robin, and Commander pods.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'swiss';

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_mode_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_mode_check
  CHECK (mode = ANY (ARRAY['swiss','single_elimination','double_elimination','round_robin','commander_pods']::text[]));

UPDATE public.tournaments
SET mode = CASE
  WHEN settings->>'tournamentMode' = ANY (ARRAY['swiss','single_elimination','double_elimination','round_robin','commander_pods']::text[])
    THEN settings->>'tournamentMode'
  ELSE COALESCE(mode, 'swiss')
END
WHERE mode IS NULL OR mode = 'swiss';

UPDATE public.tournaments
SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{tournamentMode}', to_jsonb(mode), true)
WHERE COALESCE(settings->>'tournamentMode', '') = '';

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.tournament_rounds'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%phase%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tournament_rounds DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.tournament_rounds
  ADD CONSTRAINT tournament_rounds_phase_check
  CHECK (phase = ANY (ARRAY[
    'swiss',
    'top_cut',
    'single_elimination',
    'double_elimination_winners',
    'double_elimination_losers',
    'double_elimination_grand_final',
    'round_robin',
    'commander_pods'
  ]::text[]));

ALTER TABLE public.tournament_rounds
  ADD COLUMN IF NOT EXISTS stage_order integer;

UPDATE public.tournament_rounds
SET stage_order = CASE WHEN phase = 'top_cut' THEN 1000 + round_number ELSE round_number END
WHERE stage_order IS NULL;

ALTER TABLE public.tournament_matches
  ADD COLUMN IF NOT EXISTS bracket_slot text,
  ADD COLUMN IF NOT EXISTS source_label text,
  ADD COLUMN IF NOT EXISTS next_match_hint text,
  ADD COLUMN IF NOT EXISTS loser_next_match_hint text,
  ADD COLUMN IF NOT EXISTS result_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.tournament_pods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,
  table_number integer NOT NULL CHECK (table_number >= 1),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','confirmed']::text[])),
  winner_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, table_number)
);

CREATE TABLE IF NOT EXISTS public.tournament_pod_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES public.tournament_pods(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.tournament_participants(id) ON DELETE CASCADE,
  seat_number integer NOT NULL CHECK (seat_number >= 1),
  points integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  placement integer,
  dropped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pod_id, participant_id),
  UNIQUE (pod_id, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_tournaments_mode ON public.tournaments(mode);
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_stage_order ON public.tournament_rounds(tournament_id, stage_order);
CREATE INDEX IF NOT EXISTS idx_tournament_pods_tournament ON public.tournament_pods(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pods_round ON public.tournament_pods(round_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pod_entries_tournament ON public.tournament_pod_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pod_entries_pod ON public.tournament_pod_entries(pod_id);
CREATE INDEX IF NOT EXISTS idx_tournament_pod_entries_participant ON public.tournament_pod_entries(participant_id);

ALTER TABLE public.tournament_pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_pod_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournament participants can read pods" ON public.tournament_pods;
CREATE POLICY "Tournament participants can read pods"
  ON public.tournament_pods FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_pods.tournament_id
        AND t.host_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_participants p
      WHERE p.tournament_id = tournament_pods.tournament_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tournament participants can read pod entries" ON public.tournament_pod_entries;
CREATE POLICY "Tournament participants can read pod entries"
  ON public.tournament_pod_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_pod_entries.tournament_id
        AND t.host_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_participants p
      WHERE p.tournament_id = tournament_pod_entries.tournament_id
        AND p.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.tournament_pods TO authenticated;
GRANT SELECT ON public.tournament_pod_entries TO authenticated;

ALTER TABLE public.tournament_pods REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_pod_entries REPLICA IDENTITY FULL;

DO $$
DECLARE
  tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY ARRAY['tournament_pods','tournament_pod_entries']
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMENT ON COLUMN public.tournaments.mode IS 'Tournament Manager event structure: swiss, single elimination, double elimination, round robin, or commander pods.';
COMMENT ON COLUMN public.tournament_rounds.stage_order IS 'Monotonic display/progression order across phases whose round_number may reset.';
COMMENT ON TABLE public.tournament_pods IS 'Commander pod rounds for Tournament Manager multiplayer events.';
COMMENT ON TABLE public.tournament_pod_entries IS 'Participants seated within Commander pods, including winner-only points for v1.';
