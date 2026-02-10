-- Admin analytics: extra columns for cost explainability and drilldowns.
-- Migration 039 already added layer0_mode, layer0_reason. This adds request_kind (alias) and all analytics fields.
-- Supabase: public.ai_usage. All columns nullable; no backfill.

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS request_kind TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS has_deck_context BOOLEAN NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS deck_card_count INT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS used_v2_summary BOOLEAN NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS used_two_stage BOOLEAN NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS planner_model TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS planner_tokens_in INT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS planner_tokens_out INT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS planner_cost_usd NUMERIC(10,6) NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS stop_sequences_enabled BOOLEAN NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS max_tokens_config INT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS response_truncated BOOLEAN NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS user_tier TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS deck_id UUID NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS latency_ms INT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS cache_kind TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS error_code TEXT NULL;

COMMENT ON COLUMN public.ai_usage.request_kind IS 'NO_LLM | MINI_ONLY | FULL_LLM; alias of layer0_mode for analytics';
COMMENT ON COLUMN public.ai_usage.has_deck_context IS 'True if deck summary or context was available';
COMMENT ON COLUMN public.ai_usage.used_v2_summary IS 'True if v2 summary was injected into prompt';
COMMENT ON COLUMN public.ai_usage.used_two_stage IS 'True if planner outline was used (non-stream)';
COMMENT ON COLUMN public.ai_usage.planner_cost_usd IS 'Cost of planner call when used_two_stage';
COMMENT ON COLUMN public.ai_usage.cache_kind IS 'exact | paste_ttl | linked_db | none';
COMMENT ON COLUMN public.ai_usage.error_code IS '429_budget | timeout | provider_error | etc.';

CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at_desc ON public.ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_route_created_at ON public.ai_usage (route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model_created_at ON public.ai_usage (model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id_created_at ON public.ai_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_deck_id_created_at ON public.ai_usage (deck_id, created_at DESC);
