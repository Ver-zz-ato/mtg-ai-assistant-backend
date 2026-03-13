-- Thread-level commander and decklist for paste-based conversations
-- Used to avoid re-extracting from history; enables CRITICAL block when commander confirmed
ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS commander TEXT,
  ADD COLUMN IF NOT EXISTS decklist_text TEXT;

COMMENT ON COLUMN chat_threads.commander IS 'Confirmed commander name for paste-based deck; null when not yet confirmed or when deck_id is primary.';
COMMENT ON COLUMN chat_threads.decklist_text IS 'Most recent pasted decklist text; used when deck_id is null. Cleared/replaced when user pastes new list.';
