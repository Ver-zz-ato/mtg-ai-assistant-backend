-- Collections schema extensions for Supabase
-- Safe to run multiple times (IF NOT EXISTS used). Review before applying in production.

-- 1) Collection settings/meta (public binder toggle, slug, currency, future knobs)
CREATE TABLE IF NOT EXISTS public.collection_meta (
  collection_id uuid PRIMARY KEY REFERENCES public.collections(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT false,
  public_slug text UNIQUE,             -- optional human/qr friendly id for /binder/:slug
  currency text NOT NULL DEFAULT 'USD',
  tags_enabled boolean NOT NULL DEFAULT true,
  visibility text NOT NULL DEFAULT 'private', -- reserve for future states
  data jsonb,                          -- free-form settings
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) User-defined tags and mapping to collection cards
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,                          -- optional hex or token (e.g., 'emerald')
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS public.collection_card_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.collection_cards(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(card_id, tag_id)
);

-- Helpful indexes for filtering
CREATE INDEX IF NOT EXISTS idx_collection_cards_collection_id_name
  ON public.collection_cards (collection_id, name);

-- 3) Wishlists (optional, used to compare gaps vs a target list)
CREATE TABLE IF NOT EXISTS public.wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id uuid NOT NULL REFERENCES public.wishlists(id) ON DELETE CASCADE,
  name text NOT NULL,
  qty integer NOT NULL DEFAULT 1 CHECK (qty >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist_id_name
  ON public.wishlist_items (wishlist_id, name);

-- 4) Enrich scryfall_cache for analytics/filtering (rarity, set, colors)
ALTER TABLE public.scryfall_cache
  ADD COLUMN IF NOT EXISTS color_identity text[];
ALTER TABLE public.scryfall_cache
  ADD COLUMN IF NOT EXISTS rarity text;
ALTER TABLE public.scryfall_cache
  ADD COLUMN IF NOT EXISTS set text;
ALTER TABLE public.scryfall_cache
  ADD COLUMN IF NOT EXISTS collector_number text;

-- Optional helper view to join collection cards with cached metadata
CREATE OR REPLACE VIEW public.collection_card_enriched AS
SELECT cc.id              AS card_id,
       cc.collection_id,
       cc.name,
       cc.qty,
       cc.created_at,
       sc.type_line,
       sc.rarity,
       sc.set,
       sc.color_identity
FROM public.collection_cards cc
LEFT JOIN public.scryfall_cache sc
  ON sc.name = cc.name;

-- 5) (Optional) Public binder route using slug
-- If you prefer to keep flags only in collection_meta, the view below gives you a simple lookup by slug.
CREATE OR REPLACE VIEW public.collection_public_lookup AS
SELECT c.id AS collection_id, cm.public_slug, cm.is_public
FROM public.collections c
JOIN public.collection_meta cm ON cm.collection_id = c.id
WHERE cm.public_slug IS NOT NULL;

-- End of file
