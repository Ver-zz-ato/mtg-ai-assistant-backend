-- 020_profiles_public_pins.sql
-- Add pinned_deck_ids to profiles_public for up to 3 pinned decks
alter table public.profiles_public add column if not exists pinned_deck_ids uuid[];

-- Helpful GIN index for membership queries (optional)
create index if not exists profiles_public_pinned_gin on public.profiles_public using gin (pinned_deck_ids);