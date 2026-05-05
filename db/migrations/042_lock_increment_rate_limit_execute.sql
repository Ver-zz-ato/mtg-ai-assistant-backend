-- 042: Finish tightening durable rate-limit RPC privileges.
--
-- Postgres stores explicit EXECUTE ACL entries on functions. If `increment_rate_limit`
-- was granted to `anon`/`authenticated` previously, `REVOKE ... FROM PUBLIC`
-- alone won't remove those role-specific grants.
--
-- Intended end state:
-- - anon/authenticated: cannot call increment_rate_limit via PostgREST
-- - service_role: can execute (server-side)

BEGIN;

REVOKE ALL ON FUNCTION public.increment_rate_limit(text, text, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_rate_limit(text, text, date, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, text, date, integer) TO service_role;

COMMIT;
