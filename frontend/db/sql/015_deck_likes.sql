-- 015_deck_likes.sql
-- Table to store deck endorsements (likes/stars)
create table if not exists deck_likes (
  deck_id uuid references decks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  ip_hash text,
  created_at timestamp with time zone default now(),
  primary key (deck_id, user_id)
);

-- Optional: ensure only one like per IP per deck (when ip is captured)
-- Make sure column exists even if table predated this migration
alter table deck_likes add column if not exists ip_hash text;
create unique index if not exists deck_likes_ip_idx on deck_likes (deck_id, ip_hash) where ip_hash is not null;

-- RLS policies (adjust names to your actual schema and roles)
alter table deck_likes enable row level security;

-- Users can like/unlike (insert/delete) their own row
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deck_likes' and policyname = 'deck_likes_ins') then
    create policy deck_likes_ins on deck_likes for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deck_likes' and policyname = 'deck_likes_del') then
    create policy deck_likes_del on deck_likes for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Anyone can read like counts for public decks; owners can read for private decks
-- Assuming a decks.is_public flag and same project RLS helper
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'deck_likes' and policyname = 'deck_likes_sel_public') then
    create policy deck_likes_sel_public on deck_likes for select using (
      exists(select 1 from decks d where d.id = deck_id and (d.is_public = true or d.user_id = auth.uid()))
    );
  end if;
end $$;
