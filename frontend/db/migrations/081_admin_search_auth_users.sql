-- RPC for admin user search: find user IDs by email, id, or username.
-- auth.users has email; profiles has username. Enables finding any user regardless of listUsers pagination.
-- SECURITY DEFINER + explicit search_path for safety.
CREATE OR REPLACE FUNCTION public.admin_search_auth_users(p_search TEXT)
RETURNS TABLE (id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH needle AS (SELECT LOWER(TRIM(p_search)) AS n)
  SELECT au.id
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE LENGTH((SELECT n FROM needle)) >= 2
    AND (
      LOWER(au.email) LIKE '%' || (SELECT n FROM needle) || '%'
      OR au.id::text LIKE (SELECT n FROM needle) || '%'
      OR (p.username IS NOT NULL AND LOWER(p.username) LIKE '%' || (SELECT n FROM needle) || '%')
    )
  LIMIT 50;
$$;
