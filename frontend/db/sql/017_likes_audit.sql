-- 017_likes_audit.sql
-- Lightweight audit table to rate-limit likes toggling
create table if not exists likes_audit (
  id bigserial primary key,
  deck_id uuid references decks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  ip_hash text,
  action text check (action in ('like','unlike','toggle')),
  created_at timestamp with time zone default now()
);

alter table likes_audit enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'likes_audit' AND policyname = 'likes_audit_sel'
  ) THEN
    CREATE POLICY likes_audit_sel ON likes_audit FOR SELECT USING (true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'likes_audit' AND policyname = 'likes_audit_ins'
  ) THEN
    CREATE POLICY likes_audit_ins ON likes_audit FOR INSERT WITH CHECK (true);
  END IF;
END$$;
