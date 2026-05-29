-- Same as frontend/db/migrations/118_security_advisor_phase_b_writes.sql

-- Phase B: lock down permissive RLS writes (run AFTER Phase A code deploy).
-- Phase A routes use service role for cache/shoutbox/snapshot writes.
-- Public SELECT on shared caches and shoutbox is unchanged.

DROP POLICY IF EXISTS scryfall_cache_ins ON public.scryfall_cache;
DROP POLICY IF EXISTS scryfall_cache_upd ON public.scryfall_cache;

CREATE POLICY scryfall_cache_service_write
  ON public.scryfall_cache
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow authenticated insert/update to price_cache" ON public.price_cache;

CREATE POLICY price_cache_service_write
  ON public.price_cache
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can manage card embeddings" ON public.card_embeddings;

CREATE POLICY card_embeddings_service_write
  ON public.card_embeddings
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin can delete shoutbox messages" ON public.shoutbox_messages;
DROP POLICY IF EXISTS "Anyone can post shoutbox messages" ON public.shoutbox_messages;

CREATE POLICY shoutbox_messages_service_insert
  ON public.shoutbox_messages
  FOR INSERT
  TO service_role
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY shoutbox_messages_service_delete
  ON public.shoutbox_messages
  FOR DELETE
  TO service_role
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "System can insert variants" ON public.user_prompt_variant;

CREATE POLICY user_prompt_variant_service_insert
  ON public.user_prompt_variant
  FOR INSERT
  TO service_role
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS price_snapshots_ins ON public.price_snapshots;
DROP POLICY IF EXISTS price_snapshots_upd ON public.price_snapshots;

CREATE POLICY price_snapshots_service_write
  ON public.price_snapshots
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "scan_index_public_read ytbtz6_0" ON storage.objects;
DROP POLICY IF EXISTS "scan_index_public_read" ON storage.objects;

CREATE POLICY scan_index_public_object_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'scan-index'
    AND (
      name = 'manifest.json'
      OR name ~ '^v[0-9]+/scan-index-[ab]\.bin$'
    )
  );

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'archive_price_snapshots_to_csv',
        'log_prompt_layer_version',
        'archive_and_delete_old_snapshots',
        'set_updated_at'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
  END LOOP;
END $$;
