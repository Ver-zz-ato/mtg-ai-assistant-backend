-- SEO landing page candidates (Phase 9)
-- Generated from classified seo_queries; status draft|published|disabled

CREATE TABLE IF NOT EXISTS seo_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  template text NOT NULL,
  query text NOT NULL,
  commander_slug text,
  card_name text,
  archetype_slug text,
  strategy_slug text,
  priority int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_pages_status ON seo_pages (status);
CREATE INDEX IF NOT EXISTS idx_seo_pages_priority ON seo_pages (priority DESC);

COMMENT ON TABLE seo_pages IS 'SEO landing pages at /q/[slug]. Generated from GSC queries.';
