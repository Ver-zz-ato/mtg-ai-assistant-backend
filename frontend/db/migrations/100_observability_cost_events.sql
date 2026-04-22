-- Vercel / hot-route cost audit events (Pass 1.5). Service-role writes only.
-- Retention: use cleanup_observability_cost_events(days) from cron or manual.

CREATE TABLE IF NOT EXISTS observability_cost_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  event_name text NOT NULL,
  route text,
  method text,
  request_id text,
  session_id text,
  user_id text,
  is_anonymous boolean,
  duration_ms integer,
  success boolean,
  error_code text,
  cache_hit boolean,
  cache_key text,
  source_detail text,
  count_1 integer,
  count_2 integer,
  count_3 integer,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT observability_cost_events_source_chk CHECK (source IN ('server', 'client'))
);

CREATE INDEX IF NOT EXISTS idx_obs_cost_events_created_at ON observability_cost_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obs_cost_events_event_name ON observability_cost_events (event_name);
CREATE INDEX IF NOT EXISTS idx_obs_cost_events_route ON observability_cost_events (route);
CREATE INDEX IF NOT EXISTS idx_obs_cost_events_request_id ON observability_cost_events (request_id);
CREATE INDEX IF NOT EXISTS idx_obs_cost_events_user_id ON observability_cost_events (user_id);

COMMENT ON TABLE observability_cost_events IS 'Pass 1.5 cost audit. Cleanup: SELECT cleanup_observability_cost_events(30);';

CREATE OR REPLACE FUNCTION cleanup_observability_cost_events(days_to_keep int DEFAULT 30)
RETURNS int AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM observability_cost_events WHERE created_at < now() - (days_to_keep || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE observability_cost_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access observability_cost_events" ON observability_cost_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
