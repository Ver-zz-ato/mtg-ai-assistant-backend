-- Track last public/private visibility change for server-side cooldown enforcement.
ALTER TABLE public.decks
  ADD COLUMN IF NOT EXISTS public_toggled_at timestamptz NULL;

ALTER TABLE public.collection_meta
  ADD COLUMN IF NOT EXISTS public_toggled_at timestamptz NULL;

COMMENT ON COLUMN public.decks.public_toggled_at IS
  'Last time deck public/private visibility changed. Used by API cooldown enforcement.';

COMMENT ON COLUMN public.collection_meta.public_toggled_at IS
  'Last time collection public/private visibility changed. Used by API cooldown enforcement.';
