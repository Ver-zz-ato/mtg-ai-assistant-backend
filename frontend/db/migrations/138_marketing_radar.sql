-- Marketing Radar MVP: internal admin tool for MTG marketing signals, AI briefs, and draft content.
-- RLS enabled with no anon/authenticated policies — reads/writes via service role (Next.js admin APIs only).

-- ---------------------------------------------------------------------------
-- marketing_sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  name text NOT NULL,
  url text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_sources_type ON public.marketing_sources (type);
CREATE INDEX IF NOT EXISTS idx_marketing_sources_enabled ON public.marketing_sources (enabled);

COMMENT ON TABLE public.marketing_sources IS 'Configured sources for marketing signal ingestion (manual paste, Reddit, etc.).';

ALTER TABLE public.marketing_sources ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- marketing_signals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.marketing_sources(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  title text,
  url text,
  raw_text text,
  detected_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_signals_source_id ON public.marketing_signals (source_id);
CREATE INDEX IF NOT EXISTS idx_marketing_signals_created_at ON public.marketing_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_signals_source_type ON public.marketing_signals (source_type);

COMMENT ON TABLE public.marketing_signals IS 'Raw MTG marketing/community signals for brief generation.';

ALTER TABLE public.marketing_signals ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- marketing_briefs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_date date NOT NULL DEFAULT current_date,
  summary text,
  trending_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  trending_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_briefs_brief_date ON public.marketing_briefs (brief_date DESC, created_at DESC);

COMMENT ON TABLE public.marketing_briefs IS 'AI-generated daily marketing briefs from signals + meta context.';

ALTER TABLE public.marketing_briefs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- marketing_drafts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id uuid NOT NULL REFERENCES public.marketing_briefs(id) ON DELETE CASCADE,
  platform text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_drafts_status_check CHECK (status IN ('draft', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_marketing_drafts_brief_id ON public.marketing_drafts (brief_id);
CREATE INDEX IF NOT EXISTS idx_marketing_drafts_platform ON public.marketing_drafts (brief_id, platform);
CREATE INDEX IF NOT EXISTS idx_marketing_drafts_status ON public.marketing_drafts (status);

COMMENT ON TABLE public.marketing_drafts IS 'Platform-specific draft content linked to a brief; manual approve/reject only.';

ALTER TABLE public.marketing_drafts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Seed sources
-- ---------------------------------------------------------------------------
INSERT INTO public.marketing_sources (type, name, url, enabled)
SELECT 'manual', 'Manual paste', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'manual' AND name = 'Manual paste');

INSERT INTO public.marketing_sources (type, name, url, enabled)
SELECT 'internal', 'Discover meta_signals', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_sources WHERE type = 'internal' AND name = 'Discover meta_signals');
