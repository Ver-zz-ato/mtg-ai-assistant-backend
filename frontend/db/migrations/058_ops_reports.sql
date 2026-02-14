-- Ops reports: scheduled daily/weekly health checks stored for admin review.
CREATE TABLE IF NOT EXISTS public.ops_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  report_type text NOT NULL CHECK (report_type IN ('daily_ops', 'weekly_ops')),
  status text NOT NULL CHECK (status IN ('ok', 'warn', 'fail')),
  summary text,
  details jsonb,
  duration_ms int,
  error text
);

CREATE INDEX IF NOT EXISTS idx_ops_reports_type_created
  ON public.ops_reports (report_type, created_at DESC);

COMMENT ON TABLE public.ops_reports IS 'Scheduled ops health reports (daily/weekly). Posted to Discord and surfaced in /admin/ops.';
