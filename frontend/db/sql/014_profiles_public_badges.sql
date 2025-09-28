-- Add badges and counts to profiles_public
alter table public.profiles_public add column if not exists badges text[];
alter table public.profiles_public add column if not exists deck_count int;
alter table public.profiles_public add column if not exists collection_count int;
alter table public.profiles_public add column if not exists messages_30d int;