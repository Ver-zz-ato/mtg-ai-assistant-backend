-- Allow app version (mobile / external client) to read card data from scryfall_cache.
-- Without this policy, direct Supabase client calls (anon or authenticated) get no rows.
-- INSERT/UPDATE/DELETE remain restricted (no policy = not allowed).

-- Ensure RLS is enabled (idempotent)
ALTER TABLE IF EXISTS public.scryfall_cache ENABLE ROW LEVEL SECURITY;

-- Drop if exists so migration is idempotent
DROP POLICY IF EXISTS "scryfall_cache_select_public" ON public.scryfall_cache;

-- Allow SELECT for anon and authenticated (read-only card data for app/mobile)
CREATE POLICY "scryfall_cache_select_public"
  ON public.scryfall_cache
  FOR SELECT
  TO public
  USING (true);

COMMENT ON POLICY "scryfall_cache_select_public" ON public.scryfall_cache IS
  'Allows app version and web to read card data (images, metadata). Write access not granted.';
