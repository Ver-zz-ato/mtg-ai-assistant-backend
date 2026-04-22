-- Optional tracing / forensics columns for cost audit (backward compatible).

ALTER TABLE observability_cost_events ADD COLUMN IF NOT EXISTS component text;
ALTER TABLE observability_cost_events ADD COLUMN IF NOT EXISTS pathname text;
ALTER TABLE observability_cost_events ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE observability_cost_events ADD COLUMN IF NOT EXISTS status_code integer;
ALTER TABLE observability_cost_events ADD COLUMN IF NOT EXISTS parent_event_id text;
ALTER TABLE observability_cost_events ADD COLUMN IF NOT EXISTS persisted_from text;

CREATE INDEX IF NOT EXISTS idx_obs_cost_events_correlation_id ON observability_cost_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_obs_cost_events_component ON observability_cost_events (component);
CREATE INDEX IF NOT EXISTS idx_obs_cost_events_session_event ON observability_cost_events (session_id, event_name);
CREATE INDEX IF NOT EXISTS idx_obs_cost_events_pathname ON observability_cost_events (pathname);

COMMENT ON COLUMN observability_cost_events.persisted_from IS 'server | client_ingest';
