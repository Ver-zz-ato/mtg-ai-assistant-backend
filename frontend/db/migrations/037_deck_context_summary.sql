-- Deck context summary for LLM Cost Architecture v2 (Phase A).
-- Store compact summary keyed by deck_id + deck_hash. Only for linked decks.
-- Supabase: public schema.

CREATE TABLE IF NOT EXISTS public.deck_context_summary (
  deck_id UUID NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  deck_hash TEXT NOT NULL,
  summary_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (deck_id, deck_hash)
);

CREATE INDEX IF NOT EXISTS idx_deck_context_summary_deck_hash
  ON public.deck_context_summary (deck_id, deck_hash);

COMMENT ON TABLE public.deck_context_summary IS 'Compact deck summary for LLM context (v2). One row per (deck_id, deck_hash); regenerated when decklist changes.';
