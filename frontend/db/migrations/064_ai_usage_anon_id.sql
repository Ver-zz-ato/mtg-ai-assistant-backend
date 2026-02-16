-- Add anon_id to ai_usage for joining with user_attribution.
-- anon_id = hash(guest_session_token) for guests, hash(user_id) for auth users.

ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS anon_id text NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_anon_id ON public.ai_usage(anon_id) WHERE anon_id IS NOT NULL;
