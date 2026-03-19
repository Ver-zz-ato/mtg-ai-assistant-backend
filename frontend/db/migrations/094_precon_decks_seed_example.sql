-- Example seed: add a few Commander precons for testing
-- Run AFTER 094_precon_decks.sql
-- Data source: https://github.com/taw/magic-preconstructed-decks-data or official WotC lists
-- You can add more precons via Supabase SQL Editor as new sets release.

-- Example: Blame Game (Commander 2024) - minimal deck_text for testing
-- Replace deck_text with full list from Scryfall/Moxfield when backfilling
INSERT INTO public.precon_decks (name, commander, colors, format, deck_text, set_name, release_year)
VALUES (
  'Blame Game',
  'Oko, the Ringleader',
  ARRAY['G', 'U'],
  'Commander',
  '1 Oko, the Ringleader
1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Forest
1 Island',
  'Commander 2024',
  2024
)
;

-- Add more INSERT statements as needed. Example structure:
-- INSERT INTO public.precon_decks (name, commander, colors, format, deck_text, set_name, release_year)
-- VALUES ('Deck Name', 'Commander Name', ARRAY['W','U','B','R','G'], 'Commander', '1 Commander...\n1 Sol Ring\n...', 'Set Name', 2024);
