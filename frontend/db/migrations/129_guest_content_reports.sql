-- Allow anonymous, rate-limited reports for public shared surfaces.

ALTER TABLE public.user_content_reports
  ALTER COLUMN reporter_user_id DROP NOT NULL;

ALTER TABLE public.user_content_reports
  DROP CONSTRAINT IF EXISTS user_content_reports_resource_type_check;

ALTER TABLE public.user_content_reports
  ADD CONSTRAINT user_content_reports_resource_type_check
  CHECK (
    resource_type IS NULL OR
    resource_type = ANY (
      ARRAY[
        'public_profile'::text,
        'deck'::text,
        'collection'::text,
        'wishlist'::text,
        'roast'::text,
        'health_report'::text,
        'analysis_report'::text,
        'custom_card'::text
      ]
    )
  );

