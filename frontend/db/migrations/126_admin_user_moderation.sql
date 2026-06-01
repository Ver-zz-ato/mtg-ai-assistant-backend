-- Admin moderation state and audit trail for public app/community reports.

ALTER TABLE public.user_content_reports
  ADD COLUMN IF NOT EXISTS admin_notes text NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.user_moderation_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  warning_count integer NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  is_banned boolean NOT NULL DEFAULT false,
  banned_until timestamp with time zone NULL,
  last_action_type text NULL
    CHECK (last_action_type = ANY (ARRAY['warn'::text, 'ban'::text, 'unban'::text, 'note'::text])),
  last_reason text NULL,
  last_note text NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.user_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL
    CHECK (action_type = ANY (ARRAY['warn'::text, 'ban'::text, 'unban'::text, 'note'::text])),
  reason text NOT NULL,
  details text NULL,
  banned_until timestamp with time zone NULL,
  report_id uuid NULL REFERENCES public.user_content_reports(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_moderation_actions_user_created
  ON public.user_moderation_actions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_moderation_actions_report_id
  ON public.user_moderation_actions(report_id);

CREATE INDEX IF NOT EXISTS idx_user_moderation_status_banned
  ON public.user_moderation_status(is_banned, banned_until);

ALTER TABLE public.user_moderation_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_moderation_actions ENABLE ROW LEVEL SECURITY;

