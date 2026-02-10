-- ai_usage columns for LLM v2 context instrumentation.
-- Deploy migrations before code so inserts have columns available.
-- Supabase: public.ai_usage.

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS context_source TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS summary_tokens_estimate INT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS deck_hash TEXT NULL;

COMMENT ON COLUMN public.ai_usage.context_source IS 'linked_db | paste_ttl | raw_fallback for v2 context path';
COMMENT ON COLUMN public.ai_usage.summary_tokens_estimate IS 'Estimated input tokens from summary when context_source is set';
COMMENT ON COLUMN public.ai_usage.deck_hash IS 'Deck list hash when deck context was used';
