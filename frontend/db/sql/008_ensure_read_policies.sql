-- db/sql/008_ensure_read_policies.sql
BEGIN;

ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;

-- Read policy on decks: public OR owner
DROP POLICY IF EXISTS decks_public_read ON public.decks;
CREATE POLICY decks_public_read ON public.decks
FOR SELECT
USING ( is_public = true OR auth.uid() = user_id );

-- Read policy on deck_cards: parent deck is public OR owner
DROP POLICY IF EXISTS deck_cards_read ON public.deck_cards;
CREATE POLICY deck_cards_read ON public.deck_cards
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.decks d
    WHERE d.id = deck_cards.deck_id
      AND (d.is_public = true OR d.user_id = auth.uid())
  )
);

COMMIT;
