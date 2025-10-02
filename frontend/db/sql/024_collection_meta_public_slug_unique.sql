-- Ensure unique index on collection_meta.public_slug (optional; column already marked UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_meta_public_slug
  ON public.collection_meta (public_slug)
  WHERE public_slug IS NOT NULL;
