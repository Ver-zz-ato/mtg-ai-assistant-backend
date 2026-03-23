-- Mobile admin control plane: feature flags, remote config, app changelog (mobile What's New).
-- RLS enabled with no policies for anon/authenticated — reads/writes via service role (Next.js server only).

-- ---------------------------------------------------------------------------
-- feature_flags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform text NOT NULL DEFAULT 'all',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_platform ON public.feature_flags (platform);

COMMENT ON TABLE public.feature_flags IS 'Admin-managed mobile/web feature toggles; read by GET /api/mobile/bootstrap via service role.';

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- remote_config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.remote_config (
  key text PRIMARY KEY,
  description text,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform text NOT NULL DEFAULT 'all',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_remote_config_platform ON public.remote_config (platform);

COMMENT ON TABLE public.remote_config IS 'Admin-managed structured config for mobile; tier limits at key mobile.tiers.limits.';

ALTER TABLE public.remote_config ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- app_changelog (mobile What's New — distinct from app_config key app_changelog legacy JSON)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  platform text NOT NULL DEFAULT 'mobile',
  min_app_version text,
  max_app_version text,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_app_changelog_schedule ON public.app_changelog (
  platform,
  is_active,
  starts_at,
  ends_at,
  priority
);

COMMENT ON TABLE public.app_changelog IS 'Mobile What is New entries for bootstrap; separate from website changelog.';

ALTER TABLE public.app_changelog ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Seed data (safe defaults)
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (key, enabled, description, value, platform, updated_at)
VALUES
  ('mobile.enable_roast', true, 'Deck roast / humor tools', '{}'::jsonb, 'all', now()),
  ('mobile.enable_price_tracker', true, 'Price tracking UI', '{}'::jsonb, 'all', now()),
  ('mobile.enable_life_counter', true, 'Life counter tool', '{}'::jsonb, 'all', now()),
  ('mobile.show_guest_signup_cta', true, 'Prompt guests to sign up', '{}'::jsonb, 'all', now()),
  ('mobile.show_pro_banner_guest', false, 'Pro upsell for guests', '{}'::jsonb, 'all', now()),
  ('mobile.enable_sample_deck', false, 'Sample deck entry point', '{}'::jsonb, 'all', now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.remote_config (key, description, value, platform, updated_at)
VALUES
  (
    'mobile.home.hero',
    'Home hero copy and CTAs',
    '{"title":"Try AI on your deck","subtitle":"Instant AI analysis. No signup required.","primaryCta":"Paste & Analyze","secondaryCta":"Try sample deck"}'::jsonb,
    'all',
    now()
  ),
  (
    'mobile.home.sections_order',
    'Home section order',
    '["hero","start_here","example_analysis","explore_tools","save_and_unlock"]'::jsonb,
    'all',
    now()
  ),
  (
    'mobile.home.example_analysis',
    'Example analysis card content',
    '{"deckName":"Korvold Sacrifice","powerLevel":"High","bullets":["Wincon: aristocrats + treasure","Add more low-cost enablers","Trim a few 6+ drops"],"cta":"Paste your deck → get this"}'::jsonb,
    'all',
    now()
  ),
  (
    'mobile.tiers.limits',
    'Guest / free / pro numeric limits (-1 = unlimited)',
    '{"guest":{"chatPerDay":3,"deckAnalysisPerDay":2,"roastPerDay":1},"free":{"chatPerDay":10,"deckAnalysisPerDay":5,"roastPerDay":3},"pro":{"chatPerDay":-1,"deckAnalysisPerDay":-1,"roastPerDay":-1}}'::jsonb,
    'all',
    now()
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_changelog (id, title, body, platform, is_active, priority, starts_at)
VALUES
  (
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'Life Counter is here',
    'Track life, poison, commander damage, and more.',
    'mobile',
    true,
    10,
    now()
  )
ON CONFLICT (id) DO NOTHING;
