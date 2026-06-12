-- Marketing Radar: primary CTA, content format, SEO keyword, social repurpose metadata.

ALTER TABLE public.marketing_briefs
  ADD COLUMN IF NOT EXISTS primary_cta jsonb,
  ADD COLUMN IF NOT EXISTS content_format text,
  ADD COLUMN IF NOT EXISTS seo_target_keyword text,
  ADD COLUMN IF NOT EXISTS social_repurpose jsonb;

COMMENT ON COLUMN public.marketing_briefs.primary_cta IS 'JSON: { link_key, landing_url, rationale } — one CTA per brief';
COMMENT ON COLUMN public.marketing_briefs.content_format IS 'roast_hook | swap_spotlight | mulligan_math | commander_spotlight | tool_demo';
COMMENT ON COLUMN public.marketing_briefs.seo_target_keyword IS 'Target search phrase for blog draft';
COMMENT ON COLUMN public.marketing_briefs.social_repurpose IS 'JSON: { x_thread_bullets[], instagram_carousel_slides[] }';
