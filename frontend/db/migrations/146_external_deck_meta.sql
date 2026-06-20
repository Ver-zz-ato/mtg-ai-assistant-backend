-- External Deck Meta V1: QA-first public deck ingestion for admin-only rollups.
-- Raw external data must not power public/mobile output directly.

CREATE TABLE IF NOT EXISTS public.external_deck_sources (
  source_key text PRIMARY KEY,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  discovery_enabled boolean NOT NULL DEFAULT false,
  approved_for_profiles boolean NOT NULL DEFAULT true,
  base_url text,
  rate_limit_per_minute integer NOT NULL DEFAULT 12,
  min_delay_ms integer NOT NULL DEFAULT 5000,
  max_decks_per_run integer NOT NULL DEFAULT 20,
  max_discovery_pages_per_run integer NOT NULL DEFAULT 0,
  cooldown_until timestamptz,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.external_deck_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.external_deck_sources
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.external_deck_ingest_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL REFERENCES public.external_deck_sources(source_key) ON DELETE CASCADE,
  external_id text NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'skipped', 'failed')),
  submitted_by uuid,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  last_error_code text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_deck_ingest_queue_status
  ON public.external_deck_ingest_queue (status, next_attempt_at);

ALTER TABLE public.external_deck_ingest_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.external_deck_ingest_queue
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.external_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL REFERENCES public.external_deck_sources(source_key) ON DELETE CASCADE,
  external_id text NOT NULL,
  url text NOT NULL,
  title text,
  owner_name text,
  format text,
  commanders jsonb NOT NULL DEFAULT '[]'::jsonb,
  mainboard_count integer NOT NULL DEFAULT 0,
  sideboard_count integer NOT NULL DEFAULT 0,
  deck_hash text,
  is_valid boolean NOT NULL DEFAULT false,
  aggregate_approved boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  external_updated_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_decks_source_format
  ON public.external_decks (source_key, format);
CREATE INDEX IF NOT EXISTS idx_external_decks_valid
  ON public.external_decks (is_valid, aggregate_approved);
CREATE INDEX IF NOT EXISTS idx_external_decks_hash
  ON public.external_decks (deck_hash) WHERE deck_hash IS NOT NULL;

ALTER TABLE public.external_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.external_decks
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.external_deck_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_deck_id uuid NOT NULL REFERENCES public.external_decks(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  external_deck_source_id text NOT NULL,
  board text NOT NULL DEFAULT 'mainboard',
  quantity integer NOT NULL DEFAULT 1,
  card_name text NOT NULL,
  card_name_norm text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_deck_cards_deck
  ON public.external_deck_cards (external_deck_id);
CREATE INDEX IF NOT EXISTS idx_external_deck_cards_name
  ON public.external_deck_cards (card_name_norm);

ALTER TABLE public.external_deck_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.external_deck_cards
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.external_meta_rollups_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT current_date,
  source_key text NOT NULL,
  format text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('commander', 'card')),
  entity_name text NOT NULL,
  entity_name_norm text NOT NULL,
  deck_count integer NOT NULL DEFAULT 0,
  source_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_deck_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, source_key, format, entity_type, entity_name_norm)
);

CREATE INDEX IF NOT EXISTS idx_external_meta_rollups_daily_entity
  ON public.external_meta_rollups_daily (snapshot_date DESC, entity_type, entity_name_norm);

ALTER TABLE public.external_meta_rollups_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.external_meta_rollups_daily
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.external_commander_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commander_name text NOT NULL,
  commander_name_norm text NOT NULL,
  snapshot_date date NOT NULL DEFAULT current_date,
  raw_sample_size integer NOT NULL DEFAULT 0,
  approved_sample_size integer NOT NULL DEFAULT 0,
  excluded_count integer NOT NULL DEFAULT 0,
  exclusion_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  common_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_common_support jsonb NOT NULL DEFAULT '[]'::jsonb,
  averages jsonb NOT NULL DEFAULT '{}'::jsonb,
  curve_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric NOT NULL DEFAULT 0,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_for_public boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by uuid,
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commander_name_norm, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_external_commander_profiles_approved
  ON public.external_commander_profiles (approved_for_public, approved_sample_size DESC);

ALTER TABLE public.external_commander_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.external_commander_profiles
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.external_deck_sources (
  source_key,
  display_name,
  enabled,
  discovery_enabled,
  approved_for_profiles,
  base_url,
  rate_limit_per_minute,
  min_delay_ms,
  max_decks_per_run,
  max_discovery_pages_per_run,
  metadata
)
VALUES
  (
    'archidekt',
    'Archidekt',
    true,
    true,
    true,
    'https://archidekt.com',
    20,
    3000,
    60,
    1,
    '{"policy":"Conservative public read; stop on 429/403 and respect cooldowns."}'::jsonb
  ),
  (
    'moxfield',
    'Moxfield',
    true,
    false,
    true,
    'https://moxfield.com',
    12,
    5000,
    20,
    0,
    '{"policy":"Curated URL only in V1; no discovery/search/crawling."}'::jsonb
  )
ON CONFLICT (source_key) DO NOTHING;

COMMENT ON TABLE public.external_commander_profiles IS
  'Admin QA commander profiles from external public decks. Public/mobile consumers must only use explicitly approved rows in a later integration.';
