-- Layer 0 instrumentation: record NO_LLM / MINI_ONLY / FULL_LLM and reason.
-- Supabase: public.ai_usage.

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS layer0_mode TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS layer0_reason TEXT NULL;

COMMENT ON COLUMN public.ai_usage.layer0_mode IS 'Layer 0 gate: NO_LLM | MINI_ONLY | FULL_LLM';
COMMENT ON COLUMN public.ai_usage.layer0_reason IS 'Explainable reason from layer0Decide';
