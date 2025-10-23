-- Card Price Watchlist System
-- Similar to wishlists but for price tracking/alerts

-- Table: watchlists
CREATE TABLE IF NOT EXISTS public.watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Watchlist',
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Table: watchlist_items
CREATE TABLE IF NOT EXISTS public.watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- canonical card name
  target_price NUMERIC(10,2), -- optional: alert when price drops below this
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(watchlist_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON public.watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist_id ON public.watchlist_items(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_name ON public.watchlist_items(name);

-- RLS Policies
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

-- Watchlists: users can only see/edit their own
CREATE POLICY "Users can view own watchlists"
  ON public.watchlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlists"
  ON public.watchlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlists"
  ON public.watchlists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlists"
  ON public.watchlists FOR DELETE
  USING (auth.uid() = user_id);

-- Watchlist items: users can only see/edit items in their watchlists
CREATE POLICY "Users can view own watchlist items"
  ON public.watchlist_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlists
      WHERE watchlists.id = watchlist_items.watchlist_id
      AND watchlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own watchlist items"
  ON public.watchlist_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.watchlists
      WHERE watchlists.id = watchlist_items.watchlist_id
      AND watchlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own watchlist items"
  ON public.watchlist_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlists
      WHERE watchlists.id = watchlist_items.watchlist_id
      AND watchlists.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own watchlist items"
  ON public.watchlist_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.watchlists
      WHERE watchlists.id = watchlist_items.watchlist_id
      AND watchlists.user_id = auth.uid()
    )
  );

-- Migration: Copy existing watchlist_cards from user_metadata to new table
-- This can be run manually after deployment to migrate existing Pro users
-- MIGRATION SCRIPT (run separately):
-- DO $$
-- DECLARE
--   u RECORD;
--   wl_id UUID;
--   card_name TEXT;
-- BEGIN
--   FOR u IN 
--     SELECT id, raw_user_meta_data->>'watchlist_cards' as cards
--     FROM auth.users
--     WHERE raw_user_meta_data->>'watchlist_cards' IS NOT NULL
--   LOOP
--     -- Create watchlist for user if they have cards
--     INSERT INTO public.watchlists (user_id, name, is_public)
--     VALUES (u.id, 'My Watchlist', false)
--     ON CONFLICT (user_id, name) DO UPDATE SET updated_at = now()
--     RETURNING id INTO wl_id;
--     
--     -- Parse JSON array and insert cards
--     IF u.cards IS NOT NULL THEN
--       FOR card_name IN SELECT json_array_elements_text(u.cards::json)
--       LOOP
--         INSERT INTO public.watchlist_items (watchlist_id, name)
--         VALUES (wl_id, card_name)
--         ON CONFLICT (watchlist_id, name) DO NOTHING;
--       END LOOP;
--     END IF;
--   END LOOP;
-- END $$;

