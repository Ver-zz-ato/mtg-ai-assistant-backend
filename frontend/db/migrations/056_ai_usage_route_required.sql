-- Require route for new ai_usage rows (created on or after 2026-02-14).
-- Legacy rows (before cutoff) may have route = null.
-- NOT VALID: skip validating existing rows (avoids 23514 if some post-cutoff rows have route=null).
-- New inserts/updates are still enforced.
ALTER TABLE public.ai_usage
  DROP CONSTRAINT IF EXISTS ai_usage_route_required_new_rows;

ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_route_required_new_rows
  CHECK (created_at < '2026-02-14'::timestamptz OR route IS NOT NULL)
  NOT VALID;

COMMENT ON CONSTRAINT ai_usage_route_required_new_rows ON public.ai_usage IS
  'New rows (created >= 2026-02-14) must have route populated for Quality Sentinel routing.'
