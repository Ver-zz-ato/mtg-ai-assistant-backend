-- Marketing Radar: one active draft per platform per brief, posted status, publish metadata.

ALTER TABLE public.marketing_drafts
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_post_id text;

ALTER TABLE public.marketing_drafts DROP CONSTRAINT IF EXISTS marketing_drafts_status_check;
ALTER TABLE public.marketing_drafts
  ADD CONSTRAINT marketing_drafts_status_check
  CHECK (status IN ('draft', 'approved', 'rejected', 'superseded', 'posted'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_drafts_brief_platform_active
  ON public.marketing_drafts (brief_id, platform)
  WHERE superseded_at IS NULL;
