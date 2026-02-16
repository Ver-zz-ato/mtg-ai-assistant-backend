-- RPC for Stripe webhook: look up user id by email (auth.users).
-- profiles has no email column; email lives in auth.users.
-- SECURITY DEFINER allows service role to read auth.users.
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_email)) LIMIT 1;
$$;
