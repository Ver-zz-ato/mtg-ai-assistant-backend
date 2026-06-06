ALTER TABLE public.tournament_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournament hosts can read events" ON public.tournament_events;
CREATE POLICY "Tournament hosts can read events"
  ON public.tournament_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_events.tournament_id
        AND t.host_user_id = auth.uid()
    )
  );

GRANT SELECT ON public.tournament_events TO authenticated;

ALTER TABLE public.tournament_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'tournament_events'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_events;
    END IF;
  END IF;
END $$;
