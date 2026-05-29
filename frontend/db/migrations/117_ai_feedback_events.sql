-- Unified AI feedback events (app + web). Inserts via service role in API routes only.
-- Migration: 117_ai_feedback_events.sql

CREATE TABLE IF NOT EXISTS public.ai_feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_key text,
  client text NOT NULL CHECK (client IN ('app', 'web')),
  feature text NOT NULL,
  route text,
  surface_kind text NOT NULL CHECK (surface_kind IN ('chat_message', 'ai_result', 'modal_session')),
  rating smallint CHECK (rating IS NULL OR rating IN (-1, 0, 1)),
  comment text,
  issue_types text[] NOT NULL DEFAULT '{}'::text[],
  user_input_text text,
  ai_output_text text,
  context_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  submission_id uuid,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_feedback_events_submission_id
  ON public.ai_feedback_events (submission_id)
  WHERE submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_created_at
  ON public.ai_feedback_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_feature
  ON public.ai_feedback_events (feature);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_route
  ON public.ai_feedback_events (route);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_user_id
  ON public.ai_feedback_events (user_id);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_events_client
  ON public.ai_feedback_events (client);

COMMENT ON TABLE public.ai_feedback_events IS 'Unified AI feedback: thumbs, usefulness, and structured reports from app and web.';

ALTER TABLE public.ai_feedback_events ENABLE ROW LEVEL SECURITY;

-- No public insert policies: API routes use service role only.
CREATE POLICY "Service role full access on ai_feedback_events"
  ON public.ai_feedback_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users may read their own rows (optional future in-app history).
CREATE POLICY "Users read own ai_feedback_events"
  ON public.ai_feedback_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
