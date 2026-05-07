-- Stage 2 (security): Supabase linter security_definer_view — views run as owner (elevated); use invoker so caller RLS applies.
-- Apply after validating stage 107 in staging/prod. Each ALTER is skipped if the view does not exist (local dev variance).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'ai_persona_usage_30d') THEN
    EXECUTE 'ALTER VIEW public.ai_persona_usage_30d SET (security_invoker = true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'ai_persona_usage_daily') THEN
    EXECUTE 'ALTER VIEW public.ai_persona_usage_daily SET (security_invoker = true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'collection_public_lookup') THEN
    EXECUTE 'ALTER VIEW public.collection_public_lookup SET (security_invoker = true)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'collection_card_enriched') THEN
    EXECUTE 'ALTER VIEW public.collection_card_enriched SET (security_invoker = true)';
  END IF;
END $$;
