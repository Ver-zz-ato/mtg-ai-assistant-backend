-- 016_scryfall_cache.sql
-- Simple persistent cache for Scryfall images
create table if not exists scryfall_cache (
  name text primary key, -- normalized lowercase key
  small text,
  normal text,
  art_crop text,
  updated_at timestamp with time zone default now()
);

alter table scryfall_cache enable row level security;

-- Create policies safely (Postgres doesn't support IF NOT EXISTS on CREATE POLICY)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scryfall_cache' AND policyname = 'scryfall_cache_sel'
  ) THEN
    CREATE POLICY scryfall_cache_sel ON scryfall_cache FOR SELECT USING (true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scryfall_cache' AND policyname = 'scryfall_cache_ins'
  ) THEN
    CREATE POLICY scryfall_cache_ins ON scryfall_cache FOR INSERT WITH CHECK (true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scryfall_cache' AND policyname = 'scryfall_cache_upd'
  ) THEN
    CREATE POLICY scryfall_cache_upd ON scryfall_cache FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END$$;
