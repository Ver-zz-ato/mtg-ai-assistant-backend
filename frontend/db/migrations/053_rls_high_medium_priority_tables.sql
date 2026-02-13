-- RLS for high/medium priority tables (Security Advisor).
-- These tables are server-only: accessed via service role (getAdmin()).
-- Enable RLS with no policies = deny all for anon/authenticated; service role bypasses.

-- High priority
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;

-- Medium priority
ALTER TABLE public.deck_context_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_audit_log IS 'Config change audit. Service role only. RLS enabled, no policies.';
COMMENT ON TABLE public.guest_sessions IS 'Guest session limits. Service role only. RLS enabled, no policies.';
COMMENT ON TABLE public.deck_context_summary IS 'Deck summaries for LLM. Service role only. RLS enabled, no policies.';
COMMENT ON TABLE public.prompt_versions IS 'System prompts. Service role only. RLS enabled, no policies.';
