-- profiles_public table for shared user profiles
-- Run this in Supabase SQL editor

create table if not exists public.profiles_public (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar text,
  colors text[],
  favorite_formats text[],
  favorite_commander text,
  signature_deck_id uuid,
  is_public boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create or replace function public.touch_profiles_public()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

create trigger trg_profiles_public_touch
before update on public.profiles_public
for each row execute function public.touch_profiles_public();

-- RLS
alter table public.profiles_public enable row level security;

drop policy if exists profiles_public_select on public.profiles_public;
create policy profiles_public_select on public.profiles_public
  for select using (is_public = true or auth.uid() = id);

drop policy if exists profiles_public_upsert on public.profiles_public;
create policy profiles_public_upsert on public.profiles_public
  for all using (auth.uid() = id) with check (auth.uid() = id);
