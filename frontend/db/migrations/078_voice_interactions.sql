-- Voice assistant interaction telemetry for app table-tracker and voice QA/admin export.

create table if not exists public.voice_interactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null,
  anon_id text null,
  user_tier text null,
  screen text null,
  voice_mode text null,
  transcript text null,
  detected_mode text null,
  local_parser_hit boolean null,
  action_count int not null default 0,
  pending_action_count int not null default 0,
  actions_json jsonb null,
  pending_actions_json jsonb null,
  players_snapshot_json jsonb null,
  players_count int not null default 0,
  match_quality text null,
  clarify_reason text null,
  confirmation_required boolean null,
  confirmation_reason text null,
  confirmation_resolution text null,
  assistant_text text null,
  spoken_confirmation text null,
  tts_requested boolean null,
  tts_generated boolean null,
  follow_up_used boolean null,
  final_outcome text null,
  latency_ms int null,
  error_code text null
);

create index if not exists idx_voice_interactions_created_at_desc
  on public.voice_interactions (created_at desc);

create index if not exists idx_voice_interactions_user_tier_created_at
  on public.voice_interactions (user_tier, created_at desc);

create index if not exists idx_voice_interactions_mode_created_at
  on public.voice_interactions (detected_mode, created_at desc);

create index if not exists idx_voice_interactions_screen_created_at
  on public.voice_interactions (screen, created_at desc);

create index if not exists idx_voice_interactions_match_quality_created_at
  on public.voice_interactions (match_quality, created_at desc);

alter table public.voice_interactions enable row level security;

drop policy if exists "voice_interactions_admin_deny_all" on public.voice_interactions;
create policy "voice_interactions_admin_deny_all"
  on public.voice_interactions
  for all
  using (false)
  with check (false);

comment on table public.voice_interactions is 'Structured telemetry rows for mobile voice assistant interactions.';
comment on column public.voice_interactions.anon_id is 'Guest/anonymous durable identity hash or visitor identifier.';
comment on column public.voice_interactions.match_quality is 'exact | alias | fuzzy | unresolved';
comment on column public.voice_interactions.confirmation_resolution is 'confirmed | corrected | cancelled | timeout';
