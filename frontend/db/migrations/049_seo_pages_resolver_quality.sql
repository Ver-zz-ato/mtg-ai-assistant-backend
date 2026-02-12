-- Phase 9.5: Resolver, quality score, indexing control
-- Prevents cannibalization, blocks low-quality pages, enables manual index promotion

ALTER TABLE seo_pages ADD COLUMN IF NOT EXISTS resolved_url text;
ALTER TABLE seo_pages ADD COLUMN IF NOT EXISTS quality_score int NOT NULL DEFAULT 0;
ALTER TABLE seo_pages ADD COLUMN IF NOT EXISTS indexing text NOT NULL DEFAULT 'noindex';

-- Add check constraint if it doesn't exist (PostgreSQL 9.4+)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seo_pages_indexing_check'
  ) THEN
    ALTER TABLE seo_pages ADD CONSTRAINT seo_pages_indexing_check
      CHECK (indexing IN ('index', 'noindex'));
  END IF;
END $$;

COMMENT ON COLUMN seo_pages.resolved_url IS 'When set, /q/[slug] redirects 308 to this canonical URL';
COMMENT ON COLUMN seo_pages.quality_score IS 'Computed on generate; used for publish guardrail';
COMMENT ON COLUMN seo_pages.indexing IS 'index = sitemap + robots index; noindex = block search engines';
