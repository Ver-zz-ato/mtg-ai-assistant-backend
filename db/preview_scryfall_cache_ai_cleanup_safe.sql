-- =============================================================================
-- preview_scryfall_cache_ai_cleanup_safe.sql
-- READ-ONLY PREVIEW — transaction rolled back at end
-- Source: C:\Users\davy_\Projects\mtg_ai_assistant\frontend\tmp\scryfall-cache-ai-reviewed.json
-- Rules: repair/delete + confidence high; name/name_norm use normalizeScryfallCacheName (lowercase PK)
-- merge_then_delete_bad_row: 20
-- rename_row_to_canonical: 2
-- delete_candidate: 0
-- skipped_unsafe: 3
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Section A — Preview SELECTs (rows referenced by this plan)
-- -----------------------------------------------------------------------------
SELECT * FROM public.scryfall_cache WHERE name IN ('[[doomblade]]', '[[dreadreturn]]', '[[galagreeters]]', '[[gutshot]]', '[[nature''sclaim]]', '[[seeker’s squire]]', '[[stormthevault]]', 'awaken the woods', 'awaken the woods (pbro) 170p', 'ayara, first of locthwain', 'ayara, first of locthwain (peld) 75p', 'battle angels of tyr', 'battle angels of tyr (pclb) 9p', 'beast whisperer', 'beast whisperer (pgrn) 123★', 'bolas''s citadel', 'bolas''s citadel (pwar) 79p', 'breach the multiverse', 'breach the multiverse (pmom) 94p', 'brightclimb pathway', 'brightclimb pathway // grimclimb pathway', 'claim jumper', 'claim jumper (potj) 8p', 'doom blade', 'dread return', 'elspeth, storm slayer', 'elspeth, storm slayer (ptdm) 11p', 'gala greeters', 'gut shot', 'muraganda raceway', 'muraganda raceway (pdft) 257p', 'nature''s claim', 'nessian wilds ravager', 'nessian wilds ravager (pbng) 129★', 'priest of forgotten gods', 'priest of forgotten gods (prna) 83p', 'resplendent angel', 'resplendent angel (plci) 32p', 'silent hallcreeper', 'silent hallcreeper (pdsk) 72p', 'thopter fabricator', 'thopter fabricator (pdft) 68p');

-- -----------------------------------------------------------------------------
-- Section B — Merge: fill nulls on canonical row from bad row, then delete bad in Section C
-- -----------------------------------------------------------------------------
-- merge: bad=[[doomblade]] → canonical_pk=doom blade (display: Doom Blade)
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
WHERE c.name = 'doom blade'
  AND d.name = '[[doomblade]]';

-- merge: bad=[[dreadreturn]] → canonical_pk=dread return (display: Dread Return)
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
WHERE c.name = 'dread return'
  AND d.name = '[[dreadreturn]]';

-- merge: bad=[[galagreeters]] → canonical_pk=gala greeters (display: Gala Greeters)
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
WHERE c.name = 'gala greeters'
  AND d.name = '[[galagreeters]]';

-- merge: bad=[[gutshot]] → canonical_pk=gut shot (display: Gut Shot)
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
WHERE c.name = 'gut shot'
  AND d.name = '[[gutshot]]';

-- merge: bad=[[nature'sclaim]] → canonical_pk=nature's claim (display: Nature's Claim)
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
WHERE c.name = 'nature''s claim'
  AND d.name = '[[nature''sclaim]]';

-- merge: bad=awaken the woods (pbro) 170p → canonical_pk=awaken the woods (display: Awaken the Woods)
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
WHERE c.name = 'awaken the woods'
  AND d.name = 'awaken the woods (pbro) 170p';

-- merge: bad=ayara, first of locthwain (peld) 75p → canonical_pk=ayara, first of locthwain (display: Ayara, First of Locthwain)
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
WHERE c.name = 'ayara, first of locthwain'
  AND d.name = 'ayara, first of locthwain (peld) 75p';

-- merge: bad=battle angels of tyr (pclb) 9p → canonical_pk=battle angels of tyr (display: Battle Angels of Tyr)
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
WHERE c.name = 'battle angels of tyr'
  AND d.name = 'battle angels of tyr (pclb) 9p';

-- merge: bad=beast whisperer (pgrn) 123★ → canonical_pk=beast whisperer (display: Beast Whisperer)
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
WHERE c.name = 'beast whisperer'
  AND d.name = 'beast whisperer (pgrn) 123★';

-- merge: bad=bolas's citadel (pwar) 79p → canonical_pk=bolas's citadel (display: Bolas's Citadel)
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
WHERE c.name = 'bolas''s citadel'
  AND d.name = 'bolas''s citadel (pwar) 79p';

-- merge: bad=breach the multiverse (pmom) 94p → canonical_pk=breach the multiverse (display: Breach the Multiverse)
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
WHERE c.name = 'breach the multiverse'
  AND d.name = 'breach the multiverse (pmom) 94p';

-- merge: bad=brightclimb pathway → canonical_pk=brightclimb pathway // grimclimb pathway (display: Brightclimb Pathway // Grimclimb Pathway)
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
WHERE c.name = 'brightclimb pathway // grimclimb pathway'
  AND d.name = 'brightclimb pathway';

-- merge: bad=claim jumper (potj) 8p → canonical_pk=claim jumper (display: Claim Jumper)
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
WHERE c.name = 'claim jumper'
  AND d.name = 'claim jumper (potj) 8p';

-- merge: bad=elspeth, storm slayer (ptdm) 11p → canonical_pk=elspeth, storm slayer (display: Elspeth, Storm Slayer)
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
WHERE c.name = 'elspeth, storm slayer'
  AND d.name = 'elspeth, storm slayer (ptdm) 11p';

-- merge: bad=muraganda raceway (pdft) 257p → canonical_pk=muraganda raceway (display: Muraganda Raceway)
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
WHERE c.name = 'muraganda raceway'
  AND d.name = 'muraganda raceway (pdft) 257p';

-- merge: bad=nessian wilds ravager (pbng) 129★ → canonical_pk=nessian wilds ravager (display: Nessian Wilds Ravager)
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
WHERE c.name = 'nessian wilds ravager'
  AND d.name = 'nessian wilds ravager (pbng) 129★';

-- merge: bad=priest of forgotten gods (prna) 83p → canonical_pk=priest of forgotten gods (display: Priest of Forgotten Gods)
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
WHERE c.name = 'priest of forgotten gods'
  AND d.name = 'priest of forgotten gods (prna) 83p';

-- merge: bad=resplendent angel (plci) 32p → canonical_pk=resplendent angel (display: Resplendent Angel)
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
WHERE c.name = 'resplendent angel'
  AND d.name = 'resplendent angel (plci) 32p';

-- merge: bad=silent hallcreeper (pdsk) 72p → canonical_pk=silent hallcreeper (display: Silent Hallcreeper)
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
WHERE c.name = 'silent hallcreeper'
  AND d.name = 'silent hallcreeper (pdsk) 72p';

-- merge: bad=thopter fabricator (pdft) 68p → canonical_pk=thopter fabricator (display: Thopter Fabricator)
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
WHERE c.name = 'thopter fabricator'
  AND d.name = 'thopter fabricator (pdft) 68p';

-- -----------------------------------------------------------------------------
-- Section C — Delete merged bad rows
-- -----------------------------------------------------------------------------
-- delete merged bad: [[doomblade]]
DELETE FROM public.scryfall_cache WHERE name = '[[doomblade]]';


-- delete merged bad: [[dreadreturn]]
DELETE FROM public.scryfall_cache WHERE name = '[[dreadreturn]]';


-- delete merged bad: [[galagreeters]]
DELETE FROM public.scryfall_cache WHERE name = '[[galagreeters]]';


-- delete merged bad: [[gutshot]]
DELETE FROM public.scryfall_cache WHERE name = '[[gutshot]]';


-- delete merged bad: [[nature'sclaim]]
DELETE FROM public.scryfall_cache WHERE name = '[[nature''sclaim]]';


-- delete merged bad: awaken the woods (pbro) 170p
DELETE FROM public.scryfall_cache WHERE name = 'awaken the woods (pbro) 170p';


-- delete merged bad: ayara, first of locthwain (peld) 75p
DELETE FROM public.scryfall_cache WHERE name = 'ayara, first of locthwain (peld) 75p';


-- delete merged bad: battle angels of tyr (pclb) 9p
DELETE FROM public.scryfall_cache WHERE name = 'battle angels of tyr (pclb) 9p';


-- delete merged bad: beast whisperer (pgrn) 123★
DELETE FROM public.scryfall_cache WHERE name = 'beast whisperer (pgrn) 123★';


-- delete merged bad: bolas's citadel (pwar) 79p
DELETE FROM public.scryfall_cache WHERE name = 'bolas''s citadel (pwar) 79p';


-- delete merged bad: breach the multiverse (pmom) 94p
DELETE FROM public.scryfall_cache WHERE name = 'breach the multiverse (pmom) 94p';


-- delete merged bad: brightclimb pathway
DELETE FROM public.scryfall_cache WHERE name = 'brightclimb pathway';


-- delete merged bad: claim jumper (potj) 8p
DELETE FROM public.scryfall_cache WHERE name = 'claim jumper (potj) 8p';


-- delete merged bad: elspeth, storm slayer (ptdm) 11p
DELETE FROM public.scryfall_cache WHERE name = 'elspeth, storm slayer (ptdm) 11p';


-- delete merged bad: muraganda raceway (pdft) 257p
DELETE FROM public.scryfall_cache WHERE name = 'muraganda raceway (pdft) 257p';


-- delete merged bad: nessian wilds ravager (pbng) 129★
DELETE FROM public.scryfall_cache WHERE name = 'nessian wilds ravager (pbng) 129★';


-- delete merged bad: priest of forgotten gods (prna) 83p
DELETE FROM public.scryfall_cache WHERE name = 'priest of forgotten gods (prna) 83p';


-- delete merged bad: resplendent angel (plci) 32p
DELETE FROM public.scryfall_cache WHERE name = 'resplendent angel (plci) 32p';


-- delete merged bad: silent hallcreeper (pdsk) 72p
DELETE FROM public.scryfall_cache WHERE name = 'silent hallcreeper (pdsk) 72p';


-- delete merged bad: thopter fabricator (pdft) 68p
DELETE FROM public.scryfall_cache WHERE name = 'thopter fabricator (pdft) 68p';


-- -----------------------------------------------------------------------------
-- Section D — Rename bad row to canonical PK (no existing canonical row)
-- -----------------------------------------------------------------------------
-- rename: [[seeker’s squire]] → seeker's squire (display: Seeker's Squire)
UPDATE public.scryfall_cache
SET
  name = 'seeker''s squire',
  name_norm = 'seeker''s squire',
  updated_at = now()
WHERE name = '[[seeker’s squire]]';

-- rename: [[stormthevault]] → storm the vault (display: Storm the Vault)
UPDATE public.scryfall_cache
SET
  name = 'storm the vault',
  name_norm = 'storm the vault',
  updated_at = now()
WHERE name = '[[stormthevault]]';

-- -----------------------------------------------------------------------------
-- Section E — Pure deletes (delete_candidate, high confidence)
-- -----------------------------------------------------------------------------
ROLLBACK;

-- End preview