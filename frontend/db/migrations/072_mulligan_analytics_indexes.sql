-- Indexes for mulligan analytics queries (admin dashboard).
-- Migration 072

CREATE INDEX IF NOT EXISTS idx_mulligan_advice_runs_source_created
  ON public.mulligan_advice_runs (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mulligan_advice_runs_user_id
  ON public.mulligan_advice_runs (user_id)
  WHERE user_id IS NOT NULL;
