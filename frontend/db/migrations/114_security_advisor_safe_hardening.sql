-- Safe Security Advisor hardening:
-- - Pin search_path for existing public functions.
-- - Tighten public insert policies for feedback/report tables.
-- - Move likes audit and unused AI eval/review tables to service-role-only access.

-- Function search_path hardening. This does not change execute grants or function bodies.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'increment_rate_limit',
        'cleanup_old_rate_limits',
        'vacuum_analyze_table',
        'migrate_cache_schema',
        'cleanup_request_metrics',
        'cleanup_observability_cost_events',
        'match_cards',
        'match_messages',
        'enforce_deck_cards_max_200_total'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
  END LOOP;
END $$;

-- Feedback remains public-write, but only for shaped rows accepted by the API.
DO $$
BEGIN
  IF to_regclass('public.feedback') IS NOT NULL THEN
    DROP POLICY IF EXISTS "feedback_insert" ON public.feedback;
    DROP POLICY IF EXISTS "feedback_insert_anyone" ON public.feedback;
    DROP POLICY IF EXISTS "feedback_insert_valid" ON public.feedback;

    CREATE POLICY "feedback_insert_valid"
      ON public.feedback
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (
        char_length(btrim(text)) BETWEEN 1 AND 2000
        AND (rating IS NULL OR rating BETWEEN 1 AND 5)
        AND (email IS NULL OR char_length(email) <= 320)
        AND (user_id IS NULL OR user_id = auth.uid())
      );
  END IF;
END $$;

-- AI response reports remain public/auth submit, but only as pending, bounded reports.
DO $$
BEGIN
  IF to_regclass('public.ai_response_reports') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Anyone can submit reports" ON public.ai_response_reports;
    DROP POLICY IF EXISTS "Anyone can submit valid reports" ON public.ai_response_reports;

    CREATE POLICY "Anyone can submit valid reports"
      ON public.ai_response_reports
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (
        status = 'pending'
        AND (user_id IS NULL OR user_id = auth.uid())
        AND COALESCE(array_length(issue_types, 1), 0) BETWEEN 1 AND 20
        AND (description IS NULL OR char_length(description) <= 2000)
        AND (ai_response_text IS NULL OR char_length(ai_response_text) <= 50000)
        AND (user_message_text IS NULL OR char_length(user_message_text) <= 10000)
        AND (thread_id IS NULL OR char_length(thread_id) <= 200)
        AND (message_id IS NULL OR char_length(message_id) <= 200)
      );
  END IF;
END $$;

-- likes_audit is an internal rate-limit/audit table. API writes now use service role.
DO $$
BEGIN
  IF to_regclass('public.likes_audit') IS NOT NULL THEN
    ALTER TABLE public.likes_audit ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "likes_audit_ins" ON public.likes_audit;
    DROP POLICY IF EXISTS "likes_audit_sel" ON public.likes_audit;
    DROP POLICY IF EXISTS "Service role only likes_audit" ON public.likes_audit;

    CREATE POLICY "Service role only likes_audit"
      ON public.likes_audit
      FOR ALL
      TO service_role
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');

    REVOKE ALL ON TABLE public.likes_audit FROM anon, authenticated;
    GRANT ALL ON TABLE public.likes_audit TO service_role;
  END IF;

  IF to_regclass('public.likes_audit_id_seq') IS NOT NULL THEN
    REVOKE ALL ON SEQUENCE public.likes_audit_id_seq FROM anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.likes_audit_id_seq TO service_role;
  END IF;
END $$;

-- Unused/internal AI review/eval tables should not be client-readable or writable.
DO $$
BEGIN
  IF to_regclass('public.ai_human_reviews') IS NOT NULL THEN
    ALTER TABLE public.ai_human_reviews ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "ai_human_reviews_all" ON public.ai_human_reviews;
    DROP POLICY IF EXISTS "Service role only ai_human_reviews" ON public.ai_human_reviews;

    CREATE POLICY "Service role only ai_human_reviews"
      ON public.ai_human_reviews
      FOR ALL
      TO service_role
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');

    REVOKE ALL ON TABLE public.ai_human_reviews FROM anon, authenticated;
    GRANT ALL ON TABLE public.ai_human_reviews TO service_role;
  END IF;

  IF to_regclass('public.ai_pairwise_results') IS NOT NULL THEN
    ALTER TABLE public.ai_pairwise_results ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "ai_pairwise_results_all" ON public.ai_pairwise_results;
    DROP POLICY IF EXISTS "Service role only ai_pairwise_results" ON public.ai_pairwise_results;

    CREATE POLICY "Service role only ai_pairwise_results"
      ON public.ai_pairwise_results
      FOR ALL
      TO service_role
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');

    REVOKE ALL ON TABLE public.ai_pairwise_results FROM anon, authenticated;
    GRANT ALL ON TABLE public.ai_pairwise_results TO service_role;
  END IF;
END $$;
