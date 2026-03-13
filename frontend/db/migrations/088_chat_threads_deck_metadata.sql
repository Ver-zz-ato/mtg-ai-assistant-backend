-- Deck metadata for chat threads (ActiveDeckContext persistence)
-- Depends on 087_add_thread_commander_decklist.sql
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS commander_status TEXT,
  ADD COLUMN IF NOT EXISTS deck_source TEXT,
  ADD COLUMN IF NOT EXISTS decklist_hash TEXT,
  ADD COLUMN IF NOT EXISTS deck_context_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deck_parse_meta JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN chat_threads.commander_status IS 'missing | inferred | confirmed | corrected. inferred=tentative; confirmed/corrected=authoritative.';
COMMENT ON COLUMN chat_threads.deck_source IS 'linked | pasted | imported | unknown (broad persistence audit).';
COMMENT ON COLUMN chat_threads.decklist_hash IS 'Stable hash of normalized decklist for change detection.';
COMMENT ON COLUMN chat_threads.deck_context_updated_at IS 'Last deck context change timestamp.';
COMMENT ON COLUMN chat_threads.deck_parse_meta IS 'Card count, warnings, and other parse metadata (JSONB).';
