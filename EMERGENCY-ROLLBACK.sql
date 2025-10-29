-- ========================================
-- EMERGENCY ROLLBACK - RESTORE SECURITY DEFINER
-- Your collections are still there, just blocked by RLS
-- This will restore the views to working state
-- ========================================

-- Restore collection_card_enriched with SECURITY DEFINER
DROP VIEW IF EXISTS public.collection_card_enriched CASCADE;
CREATE VIEW public.collection_card_enriched 
WITH (security_barrier = true) AS 
SELECT 
  cc.id AS card_id,
  cc.collection_id,
  cc.name,
  cc.qty,
  cc.created_at,
  sc.type_line,
  sc.rarity,
  sc.set,
  sc.color_identity
FROM collection_cards cc
LEFT JOIN scryfall_cache sc ON sc.name = cc.name;

-- Restore collection_public_lookup with SECURITY DEFINER
DROP VIEW IF EXISTS public.collection_public_lookup CASCADE;
CREATE VIEW public.collection_public_lookup 
WITH (security_barrier = true) AS 
SELECT 
  c.id AS collection_id,
  cm.public_slug,
  cm.is_public
FROM collections c
JOIN collection_meta cm ON cm.collection_id = c.id
WHERE cm.public_slug IS NOT NULL;

-- Keep AI views without SECURITY DEFINER (they were working fine)
-- No need to restore those

-- Grant permissions
GRANT SELECT ON public.collection_card_enriched TO authenticated;
GRANT SELECT ON public.collection_public_lookup TO authenticated, anon;

-- TEST: Check if collections are back
SELECT '=== Your Collections Should Be Back ===' as test;
SELECT COUNT(*) as your_collections FROM collections WHERE user_id = auth.uid();
SELECT COUNT(*) as your_cards FROM collection_card_enriched;

SELECT '✅ Collections should be restored!' as status;

