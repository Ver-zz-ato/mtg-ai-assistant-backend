-- Mobile Tournament Manager V1.
-- Server APIs own writes; hosts and joined participants read through RLS/realtime.

CREATE TABLE IF NOT EXISTS public.tournament_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  location text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid REFERENCES public.tournament_venues(id) ON DELETE SET NULL,
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 140),
  format text NOT NULL DEFAULT 'Commander'
    CHECK (format = ANY (ARRAY['Commander','Standard','Pioneer','Modern','Pauper','Custom']::text[])),
  status text NOT NULL DEFAULT 'registration'
    CHECK (status = ANY (ARRAY['registration','active','completed','cancelled']::text[])),
  structure text NOT NULL DEFAULT 'swiss_top_cut'
    CHECK (structure = 'swiss_top_cut'),
  current_round integer NOT NULL DEFAULT 0 CHECK (current_round >= 0),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_key_hash text,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  art jsonb NOT NULL DEFAULT '{"source":"none"}'::jsonb,
  deck_id uuid REFERENCES public.decks(id) ON DELETE SET NULL,
  deck_name text,
  seed integer NOT NULL CHECK (seed >= 1),
  dropped_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_participants_identity_check CHECK (user_id IS NOT NULL OR guest_key_hash IS NOT NULL),
  CONSTRAINT tournament_participants_guest_hash_len CHECK (guest_key_hash IS NULL OR char_length(guest_key_hash) = 64),
  UNIQUE (tournament_id, user_id),
  UNIQUE (tournament_id, guest_key_hash),
  UNIQUE (tournament_id, seed)
);

CREATE TABLE IF NOT EXISTS public.tournament_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number >= 1),
  phase text NOT NULL DEFAULT 'swiss'
    CHECK (phase = ANY (ARRAY['swiss','top_cut']::text[])),
  status text NOT NULL DEFAULT 'active'
    CHECK (status = ANY (ARRAY['pairing','active','completed']::text[])),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tournament_id, phase, round_number)
);

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,
  table_number integer NOT NULL CHECK (table_number >= 1),
  player_a_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  player_b_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  player_a_game_wins integer NOT NULL DEFAULT 0 CHECK (player_a_game_wins >= 0),
  player_b_game_wins integer NOT NULL DEFAULT 0 CHECK (player_b_game_wins >= 0),
  draws integer NOT NULL DEFAULT 0 CHECK (draws >= 0),
  result text CHECK (result = ANY (ARRAY['a_win','b_win','draw']::text[])),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending','reported','confirmed','disputed','bye']::text[])),
  winner_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  reported_by_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  confirmed_by_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  disputed_by_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  host_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, table_number)
);

CREATE TABLE IF NOT EXISTS public.tournament_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.tournament_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_participant_id uuid REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_venues_owner ON public.tournament_venues(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_host ON public.tournaments(host_user_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status_expires ON public.tournaments(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON public.tournament_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_guest ON public.tournament_participants(guest_key_hash);
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament ON public.tournament_rounds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON public.tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON public.tournament_matches(round_id);
CREATE INDEX IF NOT EXISTS idx_tournament_invites_tournament ON public.tournament_invites(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_invites_expires ON public.tournament_invites(expires_at);

ALTER TABLE public.tournament_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournament venue owners can read venues" ON public.tournament_venues;
CREATE POLICY "Tournament venue owners can read venues"
  ON public.tournament_venues FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Tournament participants can read tournaments" ON public.tournaments;
CREATE POLICY "Tournament participants can read tournaments"
  ON public.tournaments FOR SELECT TO authenticated
  USING (
    host_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tournament_participants p
      WHERE p.tournament_id = tournaments.id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tournament participants can read participants" ON public.tournament_participants;
CREATE POLICY "Tournament participants can read participants"
  ON public.tournament_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_participants.tournament_id
        AND t.host_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_participants mine
      WHERE mine.tournament_id = tournament_participants.tournament_id
        AND mine.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tournament participants can read rounds" ON public.tournament_rounds;
CREATE POLICY "Tournament participants can read rounds"
  ON public.tournament_rounds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_rounds.tournament_id
        AND t.host_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_participants p
      WHERE p.tournament_id = tournament_rounds.tournament_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Tournament participants can read matches" ON public.tournament_matches;
CREATE POLICY "Tournament participants can read matches"
  ON public.tournament_matches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND t.host_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_participants p
      WHERE p.tournament_id = tournament_matches.tournament_id
        AND p.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.tournament_venues TO authenticated;
GRANT SELECT ON public.tournaments TO authenticated;
GRANT SELECT ON public.tournament_participants TO authenticated;
GRANT SELECT ON public.tournament_rounds TO authenticated;
GRANT SELECT ON public.tournament_matches TO authenticated;

ALTER TABLE public.tournaments REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_participants REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_rounds REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_matches REPLICA IDENTITY FULL;

DO $$
DECLARE
  tbl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH tbl IN ARRAY ARRAY['tournaments','tournament_participants','tournament_rounds','tournament_matches']
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

COMMENT ON TABLE public.tournaments IS 'Mobile Tournament Manager event state. Server APIs own writes; hosts and joined participants read/subscribe.';
COMMENT ON TABLE public.tournament_invites IS 'Hashed QR/link invite tokens for private mobile tournaments. Service role only.';
