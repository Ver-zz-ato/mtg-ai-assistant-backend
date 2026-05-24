-- Mobile Command Center rollups and alert history.
-- Private admin tables: server-only writes via service role/admin routes.

CREATE TABLE IF NOT EXISTS public.admin_app_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_group text NOT NULL,
  metric_key text NOT NULL,
  window_key text NOT NULL,
  source text NOT NULL DEFAULT 'mobile-command-center',
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('ok', 'info', 'warn', 'critical')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_app_metric_snapshots_unique
  ON public.admin_app_metric_snapshots (metric_group, metric_key, window_key, source);

CREATE INDEX IF NOT EXISTS admin_app_metric_snapshots_captured_at_idx
  ON public.admin_app_metric_snapshots (captured_at DESC);

CREATE INDEX IF NOT EXISTS admin_app_metric_snapshots_group_idx
  ON public.admin_app_metric_snapshots (metric_group, window_key, severity);

COMMENT ON TABLE public.admin_app_metric_snapshots IS
  'Cached private admin rollups for the ManaTap mobile launch command center.';

ALTER TABLE public.admin_app_metric_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_app_metric_snapshots_service_role_all
  ON public.admin_app_metric_snapshots;

CREATE POLICY admin_app_metric_snapshots_service_role_all
  ON public.admin_app_metric_snapshots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.admin_app_metric_snapshots FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_app_metric_snapshots TO service_role;

CREATE TABLE IF NOT EXISTS public.admin_app_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL
    CHECK (severity IN ('ok', 'info', 'warn', 'critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'muted')),
  dedupe_key text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'mobile-command-center',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  discord_status text,
  discord_sent_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_app_alerts_dedupe_key_unique
  ON public.admin_app_alerts (dedupe_key);

CREATE INDEX IF NOT EXISTS admin_app_alerts_status_severity_idx
  ON public.admin_app_alerts (status, severity, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS admin_app_alerts_last_seen_idx
  ON public.admin_app_alerts (last_seen_at DESC);

COMMENT ON TABLE public.admin_app_alerts IS
  'Private alert history for ManaTap mobile launch operations and Discord alert dedupe.';

ALTER TABLE public.admin_app_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_app_alerts_service_role_all
  ON public.admin_app_alerts;

CREATE POLICY admin_app_alerts_service_role_all
  ON public.admin_app_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.admin_app_alerts FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_app_alerts TO service_role;
