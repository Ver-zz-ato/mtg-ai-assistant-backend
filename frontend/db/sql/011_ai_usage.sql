-- db/sql/011_ai_usage.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL,
  thread_id uuid NULL REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_owner_rw ON public.ai_usage;
CREATE POLICY ai_usage_owner_rw ON public.ai_usage
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_usage_user_thread_ts ON public.ai_usage(user_id, thread_id, created_at DESC);

COMMIT;
