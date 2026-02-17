-- Admin-only mulligan advice cache. Validates cache keys + saves LLM calls.
-- Migration 069

CREATE TABLE IF NOT EXISTS public.mulligan_advice_cache_admin (
  cache_key TEXT NOT NULL PRIMARY KEY,
  response_json JSONB NOT NULL,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mulligan_advice_cache_admin_expires
  ON public.mulligan_advice_cache_admin (expires_at);

ALTER TABLE public.mulligan_advice_cache_admin ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.mulligan_advice_cache_admin IS 'Admin-only mulligan advice cache. 24h TTL. Service role only.';
