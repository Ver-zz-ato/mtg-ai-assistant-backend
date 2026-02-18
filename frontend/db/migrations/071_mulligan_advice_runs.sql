-- Mulligan advice run logging for admin visibility.
-- Migration 071

CREATE TABLE IF NOT EXISTS public.mulligan_advice_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL, -- 'admin_playground' | 'production_widget' | etc
  user_id UUID,
  deck_summary TEXT, -- truncated deck info for display
  hand_summary TEXT, -- truncated hand for display
  input_json JSONB, -- full input (deck, hand, playDraw, mulliganCount, etc)
  output_json JSONB, -- full response (action, reasons, etc)
  llm_used BOOLEAN NOT NULL DEFAULT false, -- true if LLM was called, false if deterministic/cached
  model_used TEXT,
  cost_usd NUMERIC(12, 8),
  cached BOOLEAN NOT NULL DEFAULT false,
  effective_tier TEXT,
  gate_action TEXT -- 'SKIP_LLM' | 'CALL_LLM'
);

CREATE INDEX IF NOT EXISTS idx_mulligan_advice_runs_created
  ON public.mulligan_advice_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mulligan_advice_runs_source
  ON public.mulligan_advice_runs (source);

ALTER TABLE public.mulligan_advice_runs ENABLE ROW LEVEL SECURITY;

-- Service role only (admin API inserts). No RLS policies for user access.
COMMENT ON TABLE public.mulligan_advice_runs IS 'Log of mulligan advice API runs for admin debugging. Service role only.';
