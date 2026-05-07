-- Hardening: SECURITY DEFINER RPCs were callable via PostgREST as anon/authenticated if granted via PUBLIC.
-- All production callers for these functions use the Supabase service-role client (admin routes, Stripe webhook, cron).
-- Revoke execute from client-facing roles; keep service_role (+ supabase_auth_admin for trigger-only functions).

-- --- Explicit signatures (match pg_proc / migrations 027, 028, 065, 081, db/migrations) ---

REVOKE ALL ON FUNCTION public.vacuum_analyze_table(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vacuum_analyze_table(text) TO service_role;

REVOKE ALL ON FUNCTION public.migrate_cache_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_cache_schema() TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_old_rate_limits(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_rate_limits(integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_search_auth_users(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_auth_users(text) TO service_role;

-- handle_new_user: often created outside this repo (auth trigger). Lock REST exposure only if present.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'handle_new_user'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.handle_new_user(%s) FROM PUBLIC, anon, authenticated',
      r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.handle_new_user(%s) TO service_role',
      r.args
    );
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.handle_new_user(%s) TO supabase_auth_admin',
        r.args
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.vacuum_analyze_table(text) IS 'Admin/cron only: not exposed to PostgREST anon/authenticated (migration 105).';
COMMENT ON FUNCTION public.migrate_cache_schema() IS 'Admin only: not exposed to PostgREST anon/authenticated (migration 105).';
COMMENT ON FUNCTION public.cleanup_old_rate_limits(integer) IS 'Cron/service_role only: not exposed to PostgREST anon/authenticated (migration 105).';
COMMENT ON FUNCTION public.get_user_id_by_email(text) IS 'Server/service_role only (e.g. Stripe): not exposed to PostgREST anon/authenticated (migration 105).';
COMMENT ON FUNCTION public.admin_search_auth_users(text) IS 'Admin service_role only: not exposed to PostgREST anon/authenticated (migration 105).';
