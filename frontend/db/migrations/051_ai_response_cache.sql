-- Two-tier AI response cache: public (allowlist-only) + private (scoped by user/session).
-- No client access. Service role bypasses RLS. RLS enabled for belt-and-suspenders.

-- Public cache: only for allowlisted intents (static_faq, rules, terminology) with no deck context, no chat history.
CREATE TABLE IF NOT EXISTS public.ai_public_cache (
  cache_key TEXT NOT NULL PRIMARY KEY,
  response_text TEXT NOT NULL,
  response_meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_public_cache_expires
  ON public.ai_public_cache (expires_at);

ALTER TABLE public.ai_public_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_public_cache IS 'Public AI response cache. Allowlist-only: static_faq, rules, terminology. No deck context, no chat history. Service role only.';

-- Private cache: everything else, scoped by user_id or token_hash (guest) in cache key.
CREATE TABLE IF NOT EXISTS public.ai_private_cache (
  cache_key TEXT NOT NULL PRIMARY KEY,
  response_text TEXT NOT NULL,
  response_meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_private_cache_expires
  ON public.ai_private_cache (expires_at);

ALTER TABLE public.ai_private_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ai_private_cache IS 'Private AI response cache. Scoped by user_id or guest token_hash in key. Service role only.';
