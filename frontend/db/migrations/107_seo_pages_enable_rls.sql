-- Stage 1 (security): enable RLS on seo_pages. PostgREST had no row-level guard; anon could read any row if SELECT granted.
-- Public site uses anon (createClientForStatic) for published pages + sitemap — see lib/seo-pages.ts.
-- Admin/cron uses service_role — bypasses RLS on Supabase.

ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published seo_pages" ON public.seo_pages;
CREATE POLICY "Public read published seo_pages"
  ON public.seo_pages
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

COMMENT ON TABLE public.seo_pages IS 'SEO landing pages at /q/[slug]. RLS: anon/authenticated SELECT published only; service_role bypasses for admin.';
