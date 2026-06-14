-- Dedupe store for iOS App Store written review Discord alerts (server-side cron only).

CREATE TABLE IF NOT EXISTS public.app_store_review_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id TEXT UNIQUE NOT NULL,
  rating INTEGER,
  title TEXT,
  body TEXT,
  reviewer_nickname TEXT,
  territory TEXT,
  created_date TIMESTAMPTZ,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_store_review_notifications_created_date
  ON public.app_store_review_notifications (created_date DESC);

ALTER TABLE public.app_store_review_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.app_store_review_notifications
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON TABLE public.app_store_review_notifications FROM anon, authenticated;

COMMENT ON TABLE public.app_store_review_notifications IS
  'Tracks App Store Connect customerReviews already posted to Discord. Written reviews only; star-only ratings may not appear in ASC API.';
