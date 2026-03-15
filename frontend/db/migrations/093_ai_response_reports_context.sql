-- Optional context for non-chat reports (e.g. deck analyzer suggestion reports)
-- Migration: 093_ai_response_reports_context.sql

ALTER TABLE ai_response_reports
  ADD COLUMN IF NOT EXISTS context_jsonb JSONB DEFAULT NULL;

COMMENT ON COLUMN ai_response_reports.context_jsonb IS 'Extra metadata for non-chat reports: source, deck_id, suggestion_id, etc.';
