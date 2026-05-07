-- Lock down AI auto-improve tables (migration 070 left RLS as USING (true) for role public).
-- PostgREST anon/authenticated could read/write full contents. Restrict to service_role behavior:
--   - RLS policies deny anon/authenticated (policy only passes for service_role JWT).
--   - REVOKE table privileges from anon/authenticated (defense in depth; service_role bypasses RLS).

ALTER TABLE public.ai_prompt_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_improvement_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_prompt_candidates_all" ON public.ai_prompt_candidates;
DROP POLICY IF EXISTS "ai_improvement_reports_all" ON public.ai_improvement_reports;
DROP POLICY IF EXISTS "ai_prompt_history_all" ON public.ai_prompt_history;

CREATE POLICY "Service role only"
  ON public.ai_prompt_candidates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only"
  ON public.ai_improvement_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only"
  ON public.ai_prompt_history
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON public.ai_prompt_candidates FROM anon, authenticated;
REVOKE ALL ON public.ai_improvement_reports FROM anon, authenticated;
REVOKE ALL ON public.ai_prompt_history FROM anon, authenticated;

GRANT ALL ON public.ai_prompt_candidates TO service_role;
GRANT ALL ON public.ai_improvement_reports TO service_role;
GRANT ALL ON public.ai_prompt_history TO service_role;

COMMENT ON TABLE public.ai_prompt_candidates IS 'Internal prompt variants. Server/service_role only; not exposed to PostgREST anon/authenticated.';
COMMENT ON TABLE public.ai_improvement_reports IS 'Internal auto-improve summaries. Server/service_role only.';
COMMENT ON TABLE public.ai_prompt_history IS 'Internal prompt adoption audit. Server/service_role only.';
