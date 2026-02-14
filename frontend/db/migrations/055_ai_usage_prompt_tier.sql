-- Add prompt tier and system prompt token estimate for 3-tier cost instrumentation.
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS prompt_tier TEXT NULL;
ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS system_prompt_token_estimate INT NULL;

COMMENT ON COLUMN public.ai_usage.prompt_tier IS 'micro | standard | full from 3-tier prompt architecture';
COMMENT ON COLUMN public.ai_usage.system_prompt_token_estimate IS 'Rough estimate of system prompt tokens (chars/4)';
