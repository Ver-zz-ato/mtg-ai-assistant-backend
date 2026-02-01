-- Add explicit "confirm ADD not already in decklist" to BASE expectations.
-- Complements validator; keeps thin-prompt guidance.
UPDATE prompt_layers
SET body = REPLACE(
  body,
  'Do not recommend cards already in the deck. Each recommendation',
  'Do not recommend cards already in the deck. Before suggesting ADD X, confirm X is not already in the decklist. Each recommendation'
),
meta = COALESCE(meta, '{}'::jsonb) || '{"add_confirm_not_in_deck":true}'::jsonb,
updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT'
  AND body LIKE '%Do not recommend cards already in the deck. Each recommendation%';
