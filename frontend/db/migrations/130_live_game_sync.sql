-- Live Life Counter sync for mobile QR invites.
-- Clients read session rows through RLS/Realtimes, but all writes are handled by server APIs.

CREATE TABLE IF NOT EXISTS public.live_game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  edit_mode text NOT NULL DEFAULT 'host_only'
    CHECK (edit_mode = ANY (ARRAY['host_only'::text, 'everyone'::text])),
  status text NOT NULL DEFAULT 'active'
    CHECK (status = ANY (ARRAY['active'::text, 'ended'::text, 'revoked'::text])),
  invite_revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS public.live_game_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_game_id uuid NOT NULL REFERENCES public.live_game_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'participant'
    CHECK (role = ANY (ARRAY['host'::text, 'participant'::text])),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (live_game_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.live_game_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_game_id uuid NOT NULL REFERENCES public.live_game_sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_live_game_sessions_host_user_id
  ON public.live_game_sessions(host_user_id);
CREATE INDEX IF NOT EXISTS idx_live_game_sessions_status_expires_at
  ON public.live_game_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_live_game_participants_user_id
  ON public.live_game_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_live_game_participants_live_game_id
  ON public.live_game_participants(live_game_id);
CREATE INDEX IF NOT EXISTS idx_live_game_invites_live_game_id
  ON public.live_game_invites(live_game_id);
CREATE INDEX IF NOT EXISTS idx_live_game_invites_expires_at
  ON public.live_game_invites(expires_at);

ALTER TABLE public.live_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_game_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_game_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Live game participants can read sessions" ON public.live_game_sessions;
CREATE POLICY "Live game participants can read sessions"
  ON public.live_game_sessions
  FOR SELECT
  TO authenticated
  USING (
    host_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.live_game_participants p
      WHERE p.live_game_id = live_game_sessions.id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Live game participants can read participant rows" ON public.live_game_participants;
CREATE POLICY "Live game participants can read participant rows"
  ON public.live_game_participants
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Invites are token-hash only and service-role managed; do not add client SELECT/INSERT policies.

GRANT SELECT ON public.live_game_sessions TO authenticated;
GRANT SELECT ON public.live_game_participants TO authenticated;

ALTER TABLE public.live_game_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'live_game_sessions'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_game_sessions;
  END IF;
END $$;

COMMENT ON TABLE public.live_game_sessions IS 'Mobile Life Counter live game state. Server APIs own writes; participants read and subscribe via RLS.';
COMMENT ON TABLE public.live_game_participants IS 'Authenticated and anonymous Supabase users who have joined a mobile Life Counter live game.';
COMMENT ON TABLE public.live_game_invites IS 'Hashed QR invite tokens for mobile Life Counter live games. Service role only.';
