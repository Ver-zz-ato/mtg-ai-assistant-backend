-- Deck Analysis trial credits for signed-in free users.
-- Grants Deck Analysis-only Pro-depth reports without changing profiles.is_pro.

CREATE TABLE IF NOT EXISTS public.deck_analysis_trial_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_count integer NOT NULL DEFAULT 3 CHECK (granted_count >= 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= granted_count),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.deck_analysis_trial_credits IS 'Per-user ledger for free Pro-depth Deck Analysis trial credits. Does not grant global Pro entitlement.';
COMMENT ON COLUMN public.deck_analysis_trial_credits.granted_count IS 'Total Deck Analysis-only Pro-depth trial credits granted to the user.';
COMMENT ON COLUMN public.deck_analysis_trial_credits.used_count IS 'Credits consumed by successful non-partial Deck Analysis runs.';

ALTER TABLE public.deck_analysis_trial_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deck_analysis_trial_credits_self_read ON public.deck_analysis_trial_credits;
CREATE POLICY deck_analysis_trial_credits_self_read
  ON public.deck_analysis_trial_credits
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS deck_analysis_trial_credits_service_write ON public.deck_analysis_trial_credits;
CREATE POLICY deck_analysis_trial_credits_service_write
  ON public.deck_analysis_trial_credits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_deck_analysis_trial_credits_updated_at
  ON public.deck_analysis_trial_credits (updated_at DESC);
