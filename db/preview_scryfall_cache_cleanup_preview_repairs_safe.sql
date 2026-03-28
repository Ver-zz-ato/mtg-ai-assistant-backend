-- =============================================================================
-- preview_scryfall_cache_cleanup_preview_repairs_safe.sql
-- READ-ONLY PREVIEW — BEGIN/ROLLBACK
-- Source preview: C:\Users\davy_\Projects\mtg_ai_assistant\frontend\tmp\scryfall-cache-cleanup-preview.json
-- Filter: proposed_action = repair_to_canonical only (no manual_review)
-- PK: normalizeScryfallCacheName(proposed_target_name)
-- merge_then_delete_bad_row: 1
-- rename_row_to_canonical: 0
-- skipped_unsafe: 3
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Section A — Preview SELECTs
-- -----------------------------------------------------------------------------
SELECT * FROM public.scryfall_cache WHERE name IN ('storm the vault', 'storm the vault // vault of catlacan');

-- -----------------------------------------------------------------------------
-- Section B — Merge (canonical row exists)
-- -----------------------------------------------------------------------------
-- merge: bad=storm the vault → canonical_pk=storm the vault // vault of catlacan
UPDATE public.scryfall_cache AS c
SET
  small = CASE WHEN (c.small IS NULL OR c.small = '') THEN d.small ELSE c.small END,
  normal = CASE WHEN (c.normal IS NULL OR c.normal = '') THEN d.normal ELSE c.normal END,
  art_crop = CASE WHEN (c.art_crop IS NULL OR c.art_crop = '') THEN d.art_crop ELSE c.art_crop END,
  type_line = CASE WHEN (c.type_line IS NULL OR c.type_line = '') THEN d.type_line ELSE c.type_line END,
  oracle_text = CASE WHEN (c.oracle_text IS NULL OR c.oracle_text = '') THEN d.oracle_text ELSE c.oracle_text END,
  color_identity = CASE WHEN (COALESCE(cardinality(c.color_identity), 0) = 0) THEN d.color_identity ELSE c.color_identity END,
  colors = CASE WHEN (COALESCE(cardinality(c.colors), 0) = 0) THEN d.colors ELSE c.colors END,
  keywords = CASE WHEN (COALESCE(cardinality(c.keywords), 0) = 0) THEN d.keywords ELSE c.keywords END,
  power = CASE WHEN (c.power IS NULL OR c.power = '') THEN d.power ELSE c.power END,
  toughness = CASE WHEN (c.toughness IS NULL OR c.toughness = '') THEN d.toughness ELSE c.toughness END,
  loyalty = CASE WHEN (c.loyalty IS NULL OR c.loyalty = '') THEN d.loyalty ELSE c.loyalty END,
  is_land = CASE WHEN c.is_land IS NULL THEN d.is_land ELSE c.is_land END,
  is_creature = CASE WHEN c.is_creature IS NULL THEN d.is_creature ELSE c.is_creature END,
  is_instant = CASE WHEN c.is_instant IS NULL THEN d.is_instant ELSE c.is_instant END,
  is_sorcery = CASE WHEN c.is_sorcery IS NULL THEN d.is_sorcery ELSE c.is_sorcery END,
  is_enchantment = CASE WHEN c.is_enchantment IS NULL THEN d.is_enchantment ELSE c.is_enchantment END,
  is_artifact = CASE WHEN c.is_artifact IS NULL THEN d.is_artifact ELSE c.is_artifact END,
  is_planeswalker = CASE WHEN c.is_planeswalker IS NULL THEN d.is_planeswalker ELSE c.is_planeswalker END,
  cmc = CASE WHEN c.cmc IS NULL THEN d.cmc ELSE c.cmc END,
  mana_cost = CASE WHEN (c.mana_cost IS NULL OR c.mana_cost = '') THEN d.mana_cost ELSE c.mana_cost END,
  rarity = CASE WHEN (c.rarity IS NULL OR c.rarity = '') THEN d.rarity ELSE c.rarity END,
  "set" = CASE WHEN (c."set" IS NULL OR c."set" = '') THEN d."set" ELSE c."set" END,
  collector_number = CASE WHEN (c.collector_number IS NULL OR c.collector_number = '') THEN d.collector_number ELSE c.collector_number END,
  legalities = CASE WHEN (c.legalities IS NULL OR c.legalities = '{}'::jsonb) THEN d.legalities ELSE c.legalities END,
  name_norm = CASE WHEN (c.name_norm IS NULL OR c.name_norm = '') THEN d.name_norm ELSE c.name_norm END,
  updated_at = now()
FROM public.scryfall_cache AS d
WHERE c.name = 'storm the vault // vault of catlacan'
  AND d.name = 'storm the vault';

-- -----------------------------------------------------------------------------
-- Section C — Delete merged bad rows
-- -----------------------------------------------------------------------------
-- delete merged bad: storm the vault
DELETE FROM public.scryfall_cache WHERE name = 'storm the vault';


-- -----------------------------------------------------------------------------
-- Section D — Rename (no existing canonical row)
-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- Section E — (none: deterministic preview repairs only)
-- -----------------------------------------------------------------------------

ROLLBACK;

-- End preview