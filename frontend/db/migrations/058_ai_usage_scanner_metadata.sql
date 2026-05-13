-- Mobile scanner AI correlation metadata.
-- Lets admin reporting join PostHog scanner events (`scan_attempt_id`) to ai_usage cost rows.

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS scanner_session_id TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS scanner_attempt_id TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS source_screen TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS assist_mode TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_scanner_attempt_id
  ON public.ai_usage (scanner_attempt_id)
  WHERE scanner_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_scanner_session_id_created_at
  ON public.ai_usage (scanner_session_id, created_at DESC)
  WHERE scanner_session_id IS NOT NULL;

COMMENT ON COLUMN public.ai_usage.scanner_session_id IS 'Mobile scanner session id from app analytics.';
COMMENT ON COLUMN public.ai_usage.scanner_attempt_id IS 'Mobile scanner attempt id shared with PostHog scan events.';
COMMENT ON COLUMN public.ai_usage.source_screen IS 'Mobile scanner source surface, e.g. deck_editor, collection, wishlist.';
COMMENT ON COLUMN public.ai_usage.assist_mode IS 'Scanner AI mode: fallback or improve.';
