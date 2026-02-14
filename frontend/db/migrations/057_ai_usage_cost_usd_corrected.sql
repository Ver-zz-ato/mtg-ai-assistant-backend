-- Add cost_usd_corrected for optional historical backfill.
-- Original cost_usd is preserved for audit; corrected value is recomputed from tokens/model.
-- Also ensure pricing_version exists (used by log-usage.ts; may be missing in older DBs).
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS pricing_version text NULL;

ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS cost_usd_corrected numeric NULL;

COMMENT ON COLUMN public.ai_usage.cost_usd_corrected IS
  'Recomputed cost from tokens/model (pricing.ts). Used for legacy rows with inflated cost_usd. Original cost_usd kept for audit.';
