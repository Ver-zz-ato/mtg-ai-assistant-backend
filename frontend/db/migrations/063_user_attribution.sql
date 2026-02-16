-- First-touch attribution: landing page, referrer, UTM for funnel analysis.
-- anon_id matches ai_usage.anon_id for joins. Never overwrite initial_* fields.

CREATE TABLE IF NOT EXISTS public.user_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anon_id text NOT NULL,
  user_id uuid NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  initial_pathname text NOT NULL,
  initial_referrer_domain text NULL,
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  utm_content text NULL,
  utm_term text NULL,
  CONSTRAINT user_attribution_anon_id_unique UNIQUE (anon_id),
  CONSTRAINT user_attribution_user_id_unique UNIQUE (user_id) WHERE user_id IS NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_attribution_anon_id ON public.user_attribution(anon_id);
CREATE INDEX IF NOT EXISTS idx_user_attribution_user_id ON public.user_attribution(user_id) WHERE user_id IS NOT NULL;
