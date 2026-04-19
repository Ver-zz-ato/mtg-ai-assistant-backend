-- Append-only log of meta-signals cron runs for admin visibility (last N rows pruned in app code).
-- Service role only; not used by Discover / public APIs.

CREATE TABLE IF NOT EXISTS public.meta_signals_job_run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER,
  run_result TEXT,
  ok BOOLEAN NOT NULL DEFAULT TRUE,
  snapshot_date DATE,
  pill_mode TEXT,
  summary_json JSONB NOT NULL,
  compact_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_signals_job_run_log_finished
  ON public.meta_signals_job_run_log (finished_at DESC);

ALTER TABLE public.meta_signals_job_run_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.meta_signals_job_run_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.meta_signals_job_run_log IS 'Recent meta-signals cron run summaries for admin history (pruned to ~15 rows in application).';
