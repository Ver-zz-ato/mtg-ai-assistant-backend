-- Add report versioning and idempotent run key to ops_reports.
ALTER TABLE public.ops_reports
  ADD COLUMN IF NOT EXISTS report_version text,
  ADD COLUMN IF NOT EXISTS git_sha text,
  ADD COLUMN IF NOT EXISTS run_key text;

-- Unique constraint for idempotent per-day/type (allows NULL for legacy rows).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_reports_run_key_unique') THEN
    ALTER TABLE public.ops_reports ADD CONSTRAINT ops_reports_run_key_unique UNIQUE (run_key);
  END IF;
END $$;

COMMENT ON COLUMN public.ops_reports.report_version IS 'Report schema/logic version for interpretability.';
COMMENT ON COLUMN public.ops_reports.git_sha IS 'VERCEL_GIT_COMMIT_SHA or equivalent at run time.';
COMMENT ON COLUMN public.ops_reports.run_key IS 'Idempotency key: daily_ops:YYYY-MM-DD or weekly_ops:YYYY-MM-DD.';
