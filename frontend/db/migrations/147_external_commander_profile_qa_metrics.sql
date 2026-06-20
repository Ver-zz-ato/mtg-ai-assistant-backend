ALTER TABLE IF EXISTS public.external_commander_profiles
  ADD COLUMN IF NOT EXISTS confidence_components jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_consistency jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS role_variance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS off_color_support_gap_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.external_commander_profiles.confidence_components IS
  'QA-only confidence component breakdown for external Commander profile comparison.';
COMMENT ON COLUMN public.external_commander_profiles.profile_consistency IS
  'QA-only common-card concentration and consistency metrics for profile quality review.';
COMMENT ON COLUMN public.external_commander_profiles.role_variance IS
  'QA-only variance of role counts across approved external decks in this Commander profile.';
COMMENT ON COLUMN public.external_commander_profiles.profile_warnings IS
  'QA-only warnings such as mixed archetype, low source diversity, missing confidence components, or suspicious averages.';
COMMENT ON COLUMN public.external_commander_profiles.off_color_support_gap_count IS
  'QA-only count of profile support-gap candidates rejected because they are outside commander color identity.';
