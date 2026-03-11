-- Add additional commander rules: Partner/Background, Companion, Wish effects, Silver/acorn
-- Migration 083 already added core commander legality; this adds the rest.

UPDATE prompt_layers
SET body = body || E'\n\n**PARTNER / CHOOSE A BACKGROUND**\n- Two commanders (Partner or Background) = 98 cards in deck (total 100). Color identity is the union of both commanders.\n\n**COMPANION**\n- Some cards are "banned as companion" but legal in the 99 or as commander (e.g. Lutri, the Spellchaser). Do not recommend using them as companion; flag if deck lists them as companion.\n\n**WISH EFFECTS**\n- Abilities that bring cards from "outside the game" (Living Wish, Karn the Great Creator, Spawnsire of Ulamog, etc.) do NOT function in Commander. Do not recommend wish targets or treat wishes as functional.\n\n**SILVER-BORDERED / ACORN CARDS**\n- Silver-bordered and acorn-stamped cards are not Commander-legal. Flag any in the deck and suggest legal replacements.',
  meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{updated_reason}', '"Added Partner, Companion, Wish, Silver/acorn rules"'),
  updated_at = now()
WHERE key = 'FORMAT_COMMANDER';

INSERT INTO prompt_layer_versions (layer_key, body, meta, created_at)
SELECT key, body, meta, updated_at FROM prompt_layers WHERE key = 'FORMAT_COMMANDER';
