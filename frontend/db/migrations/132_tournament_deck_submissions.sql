-- Tournament Manager deck submission policy and readable deck snapshots.

ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS deck_source text NOT NULL DEFAULT 'none'
    CHECK (deck_source = ANY (ARRAY['none','saved','pasted']::text[])),
  ADD COLUMN IF NOT EXISTS decklist_text text,
  ADD COLUMN IF NOT EXISTS deck_cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deck_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deck_updated_at timestamptz;

ALTER TABLE public.tournament_participants
  ADD CONSTRAINT tournament_participants_deck_cards_array
  CHECK (jsonb_typeof(deck_cards) = 'array');

CREATE INDEX IF NOT EXISTS idx_tournament_participants_deck_source
  ON public.tournament_participants(tournament_id, deck_source);

COMMENT ON COLUMN public.tournament_participants.deck_source IS 'Tournament deck submission source: none, saved ManaTap deck, or pasted decklist.';
COMMENT ON COLUMN public.tournament_participants.deck_cards IS 'Tournament-specific readable deck snapshot; not a normal saved deck.';
