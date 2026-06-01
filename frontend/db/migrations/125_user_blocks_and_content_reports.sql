-- Minimal UGC safety primitives for mobile/public share surfaces:
-- - user_blocks: viewers can block abusive users
-- - user_content_reports: viewers can report public profiles, shared items, and shared comments

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_user_id, blocked_user_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_user_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_user_id
  ON public.user_blocks(blocked_user_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocks" ON public.user_blocks;
CREATE POLICY "Users can view their own blocks"
  ON public.user_blocks FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_user_id);

DROP POLICY IF EXISTS "Users can create their own blocks" ON public.user_blocks;
CREATE POLICY "Users can create their own blocks"
  ON public.user_blocks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_user_id);

DROP POLICY IF EXISTS "Users can delete their own blocks" ON public.user_blocks;
CREATE POLICY "Users can delete their own blocks"
  ON public.user_blocks FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_user_id);

CREATE TABLE IF NOT EXISTS public.user_content_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_type text NOT NULL
    CHECK (subject_type = ANY (ARRAY['public_profile'::text, 'shared_item'::text, 'shared_comment'::text])),
  subject_id text NOT NULL,
  target_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  resource_type text NULL
    CHECK (
      resource_type IS NULL OR
      resource_type = ANY (
        ARRAY[
          'public_profile'::text,
          'collection'::text,
          'roast'::text,
          'health_report'::text,
          'analysis_report'::text,
          'custom_card'::text
        ]
      )
    ),
  resource_id text NULL,
  reason text NOT NULL,
  details text NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status = ANY (ARRAY['open'::text, 'reviewed'::text, 'resolved'::text, 'dismissed'::text])),
  context_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_content_reports_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_user_content_reports_reporter
  ON public.user_content_reports(reporter_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_content_reports_subject
  ON public.user_content_reports(subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_user_content_reports_target_user
  ON public.user_content_reports(target_user_id);

ALTER TABLE public.user_content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own content reports" ON public.user_content_reports;
CREATE POLICY "Users can create their own content reports"
  ON public.user_content_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_user_id);

DROP POLICY IF EXISTS "Users can view their own content reports" ON public.user_content_reports;
CREATE POLICY "Users can view their own content reports"
  ON public.user_content_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_user_id);
