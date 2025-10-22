-- ============================================================================
-- Fix Function Search Paths - Security Warning Resolution
-- Adds SET search_path = public to 4 functions to prevent schema manipulation attacks
-- Created: 2025-10-18
-- ============================================================================

-- ============================================================================
-- Function 1: collection_price_buckets
-- ============================================================================

CREATE OR REPLACE FUNCTION public.collection_price_buckets(
  p_collection_id uuid,
  p_currency text DEFAULT 'USD',
  p_snapshot_date date DEFAULT NULL
)
RETURNS TABLE(bucket text, count integer, total numeric)
LANGUAGE sql
SET search_path = public  -- SECURITY FIX: Prevent schema manipulation
AS $$
WITH latest AS (
  SELECT coalesce(p_snapshot_date, (
    SELECT snapshot_date FROM public.price_snapshots
    WHERE currency = upper(p_currency)
    ORDER BY snapshot_date DESC LIMIT 1
  )) AS dt
),
-- normalize names similar to app (lower + collapse spaces). Diacritics removal omitted.
names AS (
  SELECT lower(regexp_replace(name, '\\s+', ' ', 'g')) AS name_norm, qty
  FROM public.collection_cards
  WHERE collection_id = p_collection_id
),
prices AS (
  SELECT ps.name_norm, ps.unit::numeric AS unit
  FROM public.price_snapshots ps, latest
  WHERE ps.currency = upper(p_currency) AND ps.snapshot_date = latest.dt
)
SELECT bucket,
       count(*) AS count,
       sum(unit * qty) AS total
FROM (
  SELECT n.name_norm, n.qty, coalesce(p.unit, 0) AS unit,
    CASE
      WHEN coalesce(p.unit,0) < 1 THEN '<$1'
      WHEN p.unit < 5 THEN '$1–5'
      WHEN p.unit < 20 THEN '$5–20'
      WHEN p.unit < 50 THEN '$20–50'
      WHEN p.unit < 100 THEN '$50–100'
      ELSE '$100+'
    END AS bucket
  FROM names n
  LEFT JOIN prices p ON p.name_norm = n.name_norm
) t
GROUP BY bucket
ORDER BY CASE bucket
  WHEN '<$1' THEN 1
  WHEN '$1–5' THEN 2
  WHEN '$5–20' THEN 3
  WHEN '$20–50' THEN 4
  WHEN '$50–100' THEN 5
  ELSE 6 END;
$$;

COMMENT ON FUNCTION public.collection_price_buckets(uuid, text, date)
  IS 'Price bucket histogram for a collection using latest or given snapshot date. SET search_path = public for security.';

-- ============================================================================
-- Function 2: collection_basic_stats
-- ============================================================================

CREATE OR REPLACE FUNCTION public.collection_basic_stats(
  p_collection_id uuid
)
RETURNS TABLE(
  type_hist jsonb,
  rarity_hist jsonb,
  sets_top jsonb
)
LANGUAGE plpgsql
SET search_path = public  -- SECURITY FIX: Prevent schema manipulation
AS $$
DECLARE
  v_type jsonb := '{}'::jsonb;
  v_rarity jsonb := '{}'::jsonb;
  v_sets jsonb := '[]'::jsonb;
BEGIN
  -- Type histogram
  SELECT jsonb_build_object(
    'creature', coalesce(sum(CASE WHEN lower(coalesce(sc.type_line,'')) LIKE '%creature%' THEN cc.qty ELSE 0 END),0),
    'instant', coalesce(sum(CASE WHEN lower(coalesce(sc.type_line,'')) LIKE '%instant%' THEN cc.qty ELSE 0 END),0),
    'sorcery', coalesce(sum(CASE WHEN lower(coalesce(sc.type_line,'')) LIKE '%sorcery%' THEN cc.qty ELSE 0 END),0),
    'land',    coalesce(sum(CASE WHEN lower(coalesce(sc.type_line,'')) LIKE '%land%' THEN cc.qty ELSE 0 END),0),
    'artifact',coalesce(sum(CASE WHEN lower(coalesce(sc.type_line,'')) LIKE '%artifact%' THEN cc.qty ELSE 0 END),0),
    'enchantment',coalesce(sum(CASE WHEN lower(coalesce(sc.type_line,'')) LIKE '%enchantment%' THEN cc.qty ELSE 0 END),0)
  ) INTO v_type
  FROM public.collection_cards cc
  LEFT JOIN public.scryfall_cache sc ON sc.name = cc.name
  WHERE cc.collection_id = p_collection_id;

  -- Rarity histogram
  SELECT jsonb_object_agg(rarity, cnt) INTO v_rarity
  FROM (
    SELECT lower(coalesce(sc.rarity,'unknown')) AS rarity, sum(cc.qty)::int AS cnt
    FROM public.collection_cards cc
    LEFT JOIN public.scryfall_cache sc ON sc.name = cc.name
    WHERE cc.collection_id = p_collection_id
    GROUP BY 1
  ) x;

  -- Top sets (up to 10)
  SELECT jsonb_agg(jsonb_build_object('set', set, 'count', cnt)) INTO v_sets
  FROM (
    SELECT upper(coalesce(sc.set,'?')) AS set, sum(cc.qty)::int AS cnt
    FROM public.collection_cards cc
    LEFT JOIN public.scryfall_cache sc ON sc.name = cc.name
    WHERE cc.collection_id = p_collection_id
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 10
  ) s;

  RETURN QUERY SELECT coalesce(v_type,'{}'::jsonb), coalesce(v_rarity,'{}'::jsonb), coalesce(v_sets,'[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.collection_basic_stats(uuid)
  IS 'Card type, rarity, and set stats for a collection. SET search_path = public for security.';

-- ============================================================================
-- Function 3: update_price_cache_updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_price_cache_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public  -- SECURITY FIX: Prevent schema manipulation
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_price_cache_updated_at()
  IS 'Trigger function to update updated_at timestamp. SET search_path = public for security.';

-- ============================================================================
-- Function 4: touch_profiles_public
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_profiles_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public  -- SECURITY FIX: Prevent schema manipulation
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.touch_profiles_public()
  IS 'Trigger function to update updated_at on profiles_public. SET search_path = public for security.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check that all functions now have search_path set:
-- SELECT 
--   n.nspname AS schema,
--   p.proname AS function_name,
--   pg_get_function_identity_arguments(p.oid) AS arguments,
--   p.proconfig AS config
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public' 
-- AND p.proname IN ('collection_price_buckets', 'collection_basic_stats', 'update_price_cache_updated_at', 'touch_profiles_public');

-- ============================================================================
-- NOTES
-- ============================================================================

-- This migration fixes the "Function Search Path Mutable" security warnings
-- by explicitly setting search_path = public on all affected functions.
-- 
-- This prevents potential security issues where an attacker could manipulate
-- the search_path to inject malicious schemas that shadow the public schema.
-- 
-- No behavioral changes - functions work exactly the same, just more securely.























