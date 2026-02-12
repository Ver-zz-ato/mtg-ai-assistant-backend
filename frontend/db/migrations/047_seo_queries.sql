-- GSC query data for Phase 9: Query Harvesting → Auto Landing Pages
-- Stores clicks, impressions, CTR from Google Search Console export

CREATE TABLE IF NOT EXISTS seo_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  clicks int NOT NULL DEFAULT 0,
  impressions int NOT NULL DEFAULT 0,
  ctr numeric,
  position numeric,
  source text NOT NULL DEFAULT 'gsc',
  date_start date,
  date_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_queries_unique ON seo_queries (source, query);

CREATE INDEX IF NOT EXISTS idx_seo_queries_impressions ON seo_queries (impressions DESC);
CREATE INDEX IF NOT EXISTS idx_seo_queries_clicks ON seo_queries (clicks DESC);

COMMENT ON TABLE seo_queries IS 'GSC query data for SEO landing page generation. Ingested via admin API.';
