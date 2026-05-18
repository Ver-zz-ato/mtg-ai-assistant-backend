-- Phase 1 badge system foundation.
-- Additive only: keep existing profile/public badge arrays working while
-- introducing a canonical shared server-side source of truth.

create table if not exists public.badge_definitions (
  id text primary key,
  name text not null unique,
  description text not null,
  icon text,
  category text not null,
  metric_key text not null,
  target_value integer not null check (target_value > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_hidden boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null references public.badge_definitions(id) on delete cascade,
  unlocked_at timestamp with time zone not null default now(),
  metric_value integer,
  source text not null default 'profile_badge_sync',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint user_badges_pkey primary key (user_id, badge_id)
);

create table if not exists public.user_badge_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null references public.badge_definitions(id) on delete cascade,
  current_value integer not null default 0,
  target_value integer not null,
  unlocked boolean not null default false,
  unlocked_at timestamp with time zone,
  source text not null default 'profile_badge_sync',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint user_badge_progress_pkey primary key (user_id, badge_id)
);

create index if not exists idx_badge_definitions_active_sort
  on public.badge_definitions (is_active, sort_order);

create index if not exists idx_user_badges_badge_id
  on public.user_badges (badge_id);

create index if not exists idx_user_badge_progress_badge_id
  on public.user_badge_progress (badge_id);

alter table public.badge_definitions enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_badge_progress enable row level security;

grant select on public.badge_definitions to anon, authenticated;
grant select on public.user_badges to authenticated;
grant select on public.user_badge_progress to authenticated;

drop policy if exists badge_definitions_read_all on public.badge_definitions;
create policy badge_definitions_read_all
  on public.badge_definitions
  for select
  to anon, authenticated
  using (true);

drop policy if exists user_badges_read_own on public.user_badges;
create policy user_badges_read_own
  on public.user_badges
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_badge_progress_read_own on public.user_badge_progress;
create policy user_badge_progress_read_own
  on public.user_badge_progress
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

insert into public.badge_definitions (
  id,
  name,
  description,
  icon,
  category,
  metric_key,
  target_value,
  sort_order,
  is_active,
  is_hidden
)
values
  ('first_deck', 'First Deck', 'Create your first deck', '🃏', 'onboarding', 'deck_count', 1, 10, true, false),
  ('deck_collector', 'Deck Collector', 'Own 10 or more decks', '📚', 'deckbuilding', 'deck_count', 10, 20, true, false),
  ('deck_hoarder', 'Deck Hoarder', 'Own 50 or more decks', '🏰', 'deckbuilding', 'deck_count', 50, 30, true, false),
  ('deck_lord', 'Deck Lord', 'Own 100 or more decks', '👑', 'prestige', 'deck_count', 100, 40, true, false),
  ('chatterbox', 'Chatterbox', 'Send 10 chat messages', '💬', 'onboarding', 'chat_message_count', 10, 50, true, false),
  ('analyst', 'Analyst', 'Run deck analysis 5 times', '🧠', 'tools', 'analysis_count', 5, 60, true, false),
  ('mathlete', 'Mathlete', 'Use Probability Calculator 10 times', '🧮', 'tools', 'probability_run_count', 10, 70, true, false),
  ('mulligan_master', 'Mulligan Master', 'Run 25,000 mulligan iterations', '🎲', 'tools', 'mulligan_iteration_count', 25000, 80, true, false),
  ('budget_brain', 'Budget Brain', 'Run Budget Swaps 5 times', '💰', 'tools', 'budget_swap_count', 5, 90, true, false),
  ('card_collector', 'Card Collector', 'Add 100 cards to your collection', '📦', 'collection', 'collection_card_count', 100, 100, true, false),
  ('curator', 'Curator', 'Add 500 cards to your collection', '🗂️', 'collection', 'collection_card_count', 500, 110, true, false),
  ('roasted', 'Roasted', 'Generate your first deck roast', '🔥', 'tools', 'roast_count', 1, 120, true, false),
  ('customizer', 'Customizer', 'Create your first custom card', '🎨', 'tools', 'custom_card_count', 1, 130, true, false),
  ('pro_tactician', 'Pro Tactician', 'Unlock Pro once', '⭐', 'prestige', 'pro_upgrade_ever', 1, 140, true, false)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  category = excluded.category,
  metric_key = excluded.metric_key,
  target_value = excluded.target_value,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  is_hidden = excluded.is_hidden,
  updated_at = now();
