-- Fix duplicate active drafts (legacy: 3x X per brief) before unique index from 141.
-- Safe to re-run: only touches rows where superseded_at IS NULL and rn > 1.

-- Preview (optional):
-- SELECT brief_id, platform, count(*)
-- FROM public.marketing_drafts
-- WHERE superseded_at IS NULL
-- GROUP BY brief_id, platform
-- HAVING count(*) > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY brief_id, platform
      ORDER BY
        CASE status
          WHEN 'posted' THEN 1
          WHEN 'approved' THEN 2
          WHEN 'draft' THEN 3
          WHEN 'rejected' THEN 4
          ELSE 5
        END,
        created_at DESC
    ) AS rn
  FROM public.marketing_drafts
  WHERE superseded_at IS NULL
)
UPDATE public.marketing_drafts d
SET
  status = 'superseded',
  superseded_at = COALESCE(d.superseded_at, now()),
  updated_at = now()
FROM ranked r
WHERE d.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_drafts_brief_platform_active
  ON public.marketing_drafts (brief_id, platform)
  WHERE superseded_at IS NULL;
