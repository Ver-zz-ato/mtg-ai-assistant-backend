-- Atomic reservation/refund helpers for mobile Deck Analysis trial credits.
-- Called server-side with the service-role client only.

CREATE OR REPLACE FUNCTION public.reserve_deck_analysis_trial_credit(
  p_user_id uuid,
  p_grant_count integer DEFAULT 5
)
RETURNS TABLE (
  remaining integer,
  used_this_run boolean,
  available_for_run boolean,
  granted_count integer,
  used_count integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_grant_count integer := GREATEST(COALESCE(p_grant_count, 5), 0);
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.deck_analysis_trial_credits (user_id, granted_count, used_count)
  VALUES (p_user_id, v_grant_count, 0)
  ON CONFLICT (user_id) DO UPDATE
    SET granted_count = GREATEST(public.deck_analysis_trial_credits.granted_count, EXCLUDED.granted_count),
        updated_at = now();

  RETURN QUERY
  UPDATE public.deck_analysis_trial_credits AS credits
     SET used_count = credits.used_count + 1,
         updated_at = now()
   WHERE credits.user_id = p_user_id
     AND credits.used_count < credits.granted_count
   RETURNING
     GREATEST(credits.granted_count - credits.used_count, 0) AS remaining,
     true AS used_this_run,
     credits.used_count < credits.granted_count AS available_for_run,
     credits.granted_count,
     credits.used_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_deck_analysis_trial_credit(
  p_user_id uuid
)
RETURNS TABLE (
  remaining integer,
  used_this_run boolean,
  available_for_run boolean,
  granted_count integer,
  used_count integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.deck_analysis_trial_credits AS credits
     SET used_count = GREATEST(credits.used_count - 1, 0),
         updated_at = now()
   WHERE credits.user_id = p_user_id
     AND credits.used_count > 0
   RETURNING
     GREATEST(credits.granted_count - credits.used_count, 0) AS remaining,
     false AS used_this_run,
     credits.used_count < credits.granted_count AS available_for_run,
     credits.granted_count,
     credits.used_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_deck_analysis_trial_credit(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_deck_analysis_trial_credit(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_deck_analysis_trial_credit(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_deck_analysis_trial_credit(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.refund_deck_analysis_trial_credit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_deck_analysis_trial_credit(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.refund_deck_analysis_trial_credit(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_deck_analysis_trial_credit(uuid) TO service_role;

COMMENT ON FUNCTION public.reserve_deck_analysis_trial_credit(uuid, integer) IS
  'Atomically reserves one Deck Analysis trial credit when any remain. Service-role only.';
COMMENT ON FUNCTION public.refund_deck_analysis_trial_credit(uuid) IS
  'Refunds one previously reserved Deck Analysis trial credit for non-billable failures. Service-role only.';
