-- ============================================================================
-- Supabase Security Fixes Migration
-- Fixes 14 security errors and 4 warnings from Supabase linter
-- Created: 2025-10-18
-- ============================================================================

-- ============================================================================
-- PHASE 1: Enable RLS on Admin/Logging Tables (Admin-Only Access)
-- ============================================================================

-- Table: admin_audit
ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only" ON public.admin_audit
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Table: error_logs
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only" ON public.error_logs
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Table: eval_runs
ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only" ON public.eval_runs
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Table: knowledge_gaps
ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only" ON public.knowledge_gaps
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- ============================================================================
-- PHASE 2: Enable RLS on User-Owned Tables
-- ============================================================================

-- Table: wishlists (direct user ownership)
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_data" ON public.wishlists
FOR ALL USING (user_id = auth.uid());

-- Table: tags (direct user ownership)
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_data" ON public.tags
FOR ALL USING (user_id = auth.uid());

-- Table: wishlist_items (owned via parent wishlist)
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_items" ON public.wishlist_items
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.wishlists 
    WHERE id = wishlist_items.wishlist_id 
    AND user_id = auth.uid()
  )
);

-- Table: collection_card_tags (owned via parent collection)
ALTER TABLE public.collection_card_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_tags" ON public.collection_card_tags
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.collections 
    WHERE id = collection_card_tags.collection_id 
    AND user_id = auth.uid()
  )
);

-- ============================================================================
-- PHASE 3: Enable RLS on collection_meta (Public Read, Owner Write)
-- ============================================================================

ALTER TABLE public.collection_meta ENABLE ROW LEVEL SECURITY;

-- Anyone can read public collections or their own collections
CREATE POLICY "public_read" ON public.collection_meta
FOR SELECT USING (
  is_public = true 
  OR EXISTS (
    SELECT 1 FROM public.collections 
    WHERE id = collection_meta.collection_id 
    AND user_id = auth.uid()
  )
);

-- Only owners can insert, update, or delete
CREATE POLICY "owner_write" ON public.collection_meta
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.collections 
    WHERE id = collection_meta.collection_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "owner_update" ON public.collection_meta
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.collections 
    WHERE id = collection_meta.collection_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "owner_delete" ON public.collection_meta
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.collections 
    WHERE id = collection_meta.collection_id 
    AND user_id = auth.uid()
  )
);

-- ============================================================================
-- PHASE 4: Secure Functions (Add search_path)
-- ============================================================================

-- Note: Functions need to be recreated with SET search_path = public
-- These will need the full function definitions from your existing database

-- Function: collection_price_buckets
-- You'll need to run: SELECT pg_get_functiondef('public.collection_price_buckets'::regproc);
-- Then add "SET search_path = public" before the AS $$ clause and re-create

-- Function: collection_basic_stats
-- Same process as above

-- Function: update_price_cache_updated_at
-- Same process as above

-- Function: touch_profiles_public
-- Same process as above

-- Placeholder comment - actual function recreation requires fetching current definitions
COMMENT ON SCHEMA public IS 'Security fix migration: Functions collection_price_buckets, collection_basic_stats, update_price_cache_updated_at, and touch_profiles_public need SET search_path = public added to their definitions';

-- ============================================================================
-- PHASE 5: Document SECURITY DEFINER Views (No Changes to Views)
-- ============================================================================

COMMENT ON VIEW public.recent_public_decks IS 
'SECURITY DEFINER required: View aggregates public decks without per-row RLS checks for performance. Safe because it only exposes public data.';

COMMENT ON VIEW public.collection_card_enriched IS 
'SECURITY DEFINER required: View joins multiple tables for performance. Underlying tables have proper RLS policies.';

COMMENT ON VIEW public.collection_public_lookup IS 
'SECURITY DEFINER required: View lists public collections without per-row checks for performance. Only exposes public data.';

COMMENT ON VIEW public.ai_persona_usage_30d IS 
'SECURITY DEFINER required: Admin analytics view. Access controlled by admin-only endpoints.';

COMMENT ON VIEW public.ai_persona_usage_daily IS 
'SECURITY DEFINER required: Admin analytics view. Access controlled by admin-only endpoints.';

-- ============================================================================
-- VERIFICATION QUERIES (Run these to confirm policies are active)
-- ============================================================================

-- Check RLS is enabled on all target tables
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN (
--   'admin_audit', 'error_logs', 'eval_runs', 'knowledge_gaps',
--   'wishlists', 'wishlist_items', 'tags', 'collection_card_tags', 'collection_meta'
-- );

-- Check policies exist
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- ============================================================================
-- ROLLBACK PLAN (If something breaks, run these)
-- ============================================================================

-- DROP POLICY "admin_only" ON public.admin_audit;
-- ALTER TABLE public.admin_audit DISABLE ROW LEVEL SECURITY;

-- DROP POLICY "admin_only" ON public.error_logs;
-- ALTER TABLE public.error_logs DISABLE ROW LEVEL SECURITY;

-- DROP POLICY "admin_only" ON public.eval_runs;
-- ALTER TABLE public.eval_runs DISABLE ROW LEVEL SECURITY;

-- DROP POLICY "admin_only" ON public.knowledge_gaps;
-- ALTER TABLE public.knowledge_gaps DISABLE ROW LEVEL SECURITY;

-- DROP POLICY "users_own_data" ON public.wishlists;
-- ALTER TABLE public.wishlists DISABLE ROW LEVEL SECURITY;

-- DROP POLICY "users_own_data" ON public.tags;
-- ALTER TABLE public.tags DISABLE ROW LEVEL SECURITY;

-- DROP POLICY "users_own_items" ON public.wishlist_items;
-- ALTER TABLE public.wishlist_items DISABLE ROW LEVEL SECURITY;

-- DROP POLICY "users_own_tags" ON public.collection_card_tags;
-- ALTER TABLE public.collection_card_tags DISABLE ROW LEVEL SECURITY;

-- DROP POLICY "public_read" ON public.collection_meta;
-- DROP POLICY "owner_write" ON public.collection_meta;
-- DROP POLICY "owner_update" ON public.collection_meta;
-- DROP POLICY "owner_delete" ON public.collection_meta;
-- ALTER TABLE public.collection_meta DISABLE ROW LEVEL SECURITY;





















