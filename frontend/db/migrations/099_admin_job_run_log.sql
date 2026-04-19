-- Generic append-only log for admin cron / bulk job runs (non–meta-signals).
-- Pruned in app code to ~12 rows per job_name. Service role only.

CREATE TABLE IF NOT EXISTS public.admin_job_run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER,
  ok BOOLEAN NOT NULL DEFAULT TRUE,
  run_result TEXT,
  compact_summary TEXT NOT NULL,
  summary_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_job_run_log_job_finished
  ON public.admin_job_run_log (job_name, finished_at DESC);

ALTER TABLE public.admin_job_run_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only admin_job_run_log" ON public.admin_job_run_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.admin_job_run_log IS 'Recent admin job run summaries for QA (deck-costs, bulk imports, etc.).';
