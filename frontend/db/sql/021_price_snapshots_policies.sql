-- 021_price_snapshots_policies.sql
-- Allow inserting/upserting price snapshots (admin endpoints run as authenticated user)
-- You can tighten this later to a specific role/claim if desired.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='price_snapshots' AND policyname='price_snapshots_ins'
  ) THEN
    CREATE POLICY price_snapshots_ins ON public.price_snapshots FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='price_snapshots' AND policyname='price_snapshots_upd'
  ) THEN
    CREATE POLICY price_snapshots_upd ON public.price_snapshots FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (true);
  END IF;
END $$;