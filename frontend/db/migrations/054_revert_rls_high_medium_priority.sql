-- REVERT for 053_rls_high_medium_priority_tables.sql
-- Run this ONLY if 053 caused issues and you need to disable RLS on these tables.
-- After reverting, redeploy code that uses regular supabase client (not getAdmin) for these tables.

ALTER TABLE public.admin_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_context_summary DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions DISABLE ROW LEVEL SECURITY;
