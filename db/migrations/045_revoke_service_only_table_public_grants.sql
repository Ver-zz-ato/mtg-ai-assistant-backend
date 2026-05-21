-- Defense-in-depth for service-only tables.
-- RLS with no policies already denies anon/authenticated access; these revokes
-- remove broad table grants underneath RLS so the intended access model is clear.

REVOKE ALL ON TABLE public.admin_audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_private_cache FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_public_cache FROM anon, authenticated;
REVOKE ALL ON TABLE public.deck_context_summary FROM anon, authenticated;
REVOKE ALL ON TABLE public.guest_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.feature_flags FROM anon, authenticated;
REVOKE ALL ON TABLE public.remote_config FROM anon, authenticated;
REVOKE ALL ON TABLE public.prompt_versions FROM anon, authenticated;
