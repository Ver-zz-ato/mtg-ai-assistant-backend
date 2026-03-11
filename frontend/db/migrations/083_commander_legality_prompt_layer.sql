-- Add commander legality rules to FORMAT_COMMANDER layer
-- AI must verify the commander is legal and explain if not; suggest alternatives when possible

UPDATE prompt_layers
SET body = body || E'\n\n**COMMANDER LEGALITY (verify before analysis)**\n- A card is a legal commander if: (1) type_line contains "Legendary Creature", or (2) oracle_text contains "This card can be your commander", or (3) oracle_text contains "Choose a Background", "Partner", "Partner with", "Friends forever", or "Doctor''s companion".\n- Legendary Artifact, Legendary Enchantment, Legendary Land, Legendary Artifact — Vehicle are NOT legal unless oracle_text says "can be your commander".\n- Planeswalkers cannot be commanders unless oracle text says "This planeswalker can be your commander."\n- When evaluating decks: ALWAYS verify the commander is legal. If illegal → explain why and suggest similar legal commanders when possible.\n\n**PARTNER / CHOOSE A BACKGROUND**\n- Two commanders (Partner or Background) = 98 cards in deck (total 100). Color identity is the union of both commanders.\n\n**COMPANION**\n- Some cards are "banned as companion" but legal in the 99 or as commander (e.g. Lutri, the Spellchaser). Do not recommend using them as companion; flag if deck lists them as companion.\n\n**WISH EFFECTS**\n- Abilities that bring cards from "outside the game" (Living Wish, Karn the Great Creator, Spawnsire of Ulamog, etc.) do NOT function in Commander. Do not recommend wish targets or treat wishes as functional.\n\n**SILVER-BORDERED / ACORN CARDS**\n- Silver-bordered and acorn-stamped cards are not Commander-legal. Flag any in the deck and suggest legal replacements.',
  meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{updated_reason}', '"Added commander legality rules"'),
  updated_at = now()
WHERE key = 'FORMAT_COMMANDER';

INSERT INTO prompt_layer_versions (layer_key, body, meta, created_at)
SELECT key, body, meta, updated_at FROM prompt_layers WHERE key = 'FORMAT_COMMANDER';
