-- Deprecated eval-suite link tables (ai_eval_*): no app code references; RLS was USING (true) for all roles.
-- Restrict to service_role (same pattern as 104_lockdown_ai_auto_improve_tables).

ALTER TABLE public.ai_eval_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_eval_set_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_eval_sets_all" ON public.ai_eval_sets;
DROP POLICY IF EXISTS "ai_eval_set_runs_all" ON public.ai_eval_set_runs;

CREATE POLICY "Service role only"
  ON public.ai_eval_sets
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only"
  ON public.ai_eval_set_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON public.ai_eval_sets FROM anon, authenticated;
REVOKE ALL ON public.ai_eval_set_runs FROM anon, authenticated;

GRANT ALL ON public.ai_eval_sets TO service_role;
GRANT ALL ON public.ai_eval_set_runs TO service_role;

COMMENT ON TABLE public.ai_eval_sets IS 'Legacy golden-set metadata. Not used by production app; service_role only (migration 106).';
COMMENT ON TABLE public.ai_eval_set_runs IS 'Legacy golden-set run links. Not used by production app; service_role only (migration 106).';
