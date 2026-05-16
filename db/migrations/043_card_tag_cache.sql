create table if not exists public.card_tag_cache (
  name text primary key,
  gameplay_tags text[] not null default '{}',
  theme_tags text[] not null default '{}',
  archetype_tags text[] not null default '{}',
  commander_tags text[] not null default '{}',
  commander_eligible boolean not null default false,
  commander_power_band text,
  commander_budget_band text,
  commander_complexity text,
  commander_interaction text,
  popularity_score numeric,
  tag_version integer not null default 1,
  source text not null default 'rules_v1',
  updated_at timestamptz not null default now()
);

create index if not exists idx_card_tag_cache_commander_eligible
  on public.card_tag_cache (commander_eligible);

create index if not exists idx_card_tag_cache_power_band
  on public.card_tag_cache (commander_power_band);

create index if not exists idx_card_tag_cache_budget_band
  on public.card_tag_cache (commander_budget_band);

create index if not exists idx_card_tag_cache_updated_at
  on public.card_tag_cache (updated_at desc);

create index if not exists idx_card_tag_cache_gameplay_tags_gin
  on public.card_tag_cache using gin (gameplay_tags);

create index if not exists idx_card_tag_cache_theme_tags_gin
  on public.card_tag_cache using gin (theme_tags);

create index if not exists idx_card_tag_cache_archetype_tags_gin
  on public.card_tag_cache using gin (archetype_tags);

create index if not exists idx_card_tag_cache_commander_tags_gin
  on public.card_tag_cache using gin (commander_tags);
