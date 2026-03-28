-- =============================================================================
-- preview_scryfall_cache_ai_cleanup.sql
-- READ-ONLY PREVIEW — NOT EXECUTED by this script
-- Source: C:\Users\davy_\Projects\mtg_ai_assistant\frontend\tmp\scryfall-cache-ai-reviewed.json
-- Rules: classification in (repair_to_canonical, delete_candidate) AND confidence = high
-- repairs: 25
-- deletes: 0
-- omitted (not high confidence or missing confidence): 31 (see console)
-- =============================================================================
-- NOTE: App PK uses normalizeScryfallCacheName; you may need name_norm / updated_at to match
--       production conventions before applying any real migration.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- REPAIRS (25)
-- -----------------------------------------------------------------------------
-- Preview rows involved (bad PKs):
SELECT * FROM public.scryfall_cache WHERE name IN ('[[doomblade]]', '[[dreadreturn]]', '[[galagreeters]]', '[[gutshot]]', '[[nature''sclaim]]', '[[seeker’s squire]]', '[[stormthevault]]', '1,"ob nixilis, the hate-twisted', '1,"otawara, soaring city', '1,"shizo, death''s storehouse', 'awaken the woods (pbro) 170p', 'ayara, first of locthwain (peld) 75p', 'battle angels of tyr (pclb) 9p', 'beast whisperer (pgrn) 123★', 'bolas''s citadel (pwar) 79p', 'breach the multiverse (pmom) 94p', 'brightclimb pathway', 'claim jumper (potj) 8p', 'elspeth, storm slayer (ptdm) 11p', 'muraganda raceway (pdft) 257p', 'nessian wilds ravager (pbng) 129★', 'priest of forgotten gods (prna) 83p', 'resplendent angel (plci) 32p', 'silent hallcreeper (pdsk) 72p', 'thopter fabricator (pdft) 68p');

-- repair: [[doomblade]] → Doom Blade
--   Wrapper punctuation can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Doom Blade'
WHERE name = '[[doomblade]]';

-- repair: [[dreadreturn]] → Dread Return
--   Wrapper punctuation can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Dread Return'
WHERE name = '[[dreadreturn]]';

-- repair: [[galagreeters]] → Gala Greeters
--   Wrapper punctuation can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Gala Greeters'
WHERE name = '[[galagreeters]]';

-- repair: [[gutshot]] → Gut Shot
--   Wrapper punctuation can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Gut Shot'
WHERE name = '[[gutshot]]';

-- repair: [[nature'sclaim]] → Nature's Claim
--   Wrapper punctuation can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Nature''s Claim'
WHERE name = '[[nature''sclaim]]';

-- repair: [[seeker’s squire]] → Seeker's Squire
--   Wrapper punctuation can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Seeker''s Squire'
WHERE name = '[[seeker’s squire]]';

-- repair: [[stormthevault]] → Storm the Vault
--   Wrapper punctuation can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Storm the Vault'
WHERE name = '[[stormthevault]]';

-- repair: 1,"ob nixilis, the hate-twisted → Ob Nixilis, the Hate-Twisted
--   Leading quantity/CSV quote noise can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Ob Nixilis, the Hate-Twisted'
WHERE name = '1,"ob nixilis, the hate-twisted';

-- repair: 1,"otawara, soaring city → Otawara, Soaring City
--   Leading quantity/CSV quote noise can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Otawara, Soaring City'
WHERE name = '1,"otawara, soaring city';

-- repair: 1,"shizo, death's storehouse → Shizo, Death's Storehouse
--   Leading quantity/CSV quote noise can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Shizo, Death''s Storehouse'
WHERE name = '1,"shizo, death''s storehouse';

-- repair: awaken the woods (pbro) 170p → Awaken the Woods
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Awaken the Woods'
WHERE name = 'awaken the woods (pbro) 170p';

-- repair: ayara, first of locthwain (peld) 75p → Ayara, First of Locthwain
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Ayara, First of Locthwain'
WHERE name = 'ayara, first of locthwain (peld) 75p';

-- repair: battle angels of tyr (pclb) 9p → Battle Angels of Tyr
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Battle Angels of Tyr'
WHERE name = 'battle angels of tyr (pclb) 9p';

-- repair: beast whisperer (pgrn) 123★ → Beast Whisperer
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Beast Whisperer'
WHERE name = 'beast whisperer (pgrn) 123★';

-- repair: bolas's citadel (pwar) 79p → Bolas's Citadel
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Bolas''s Citadel'
WHERE name = 'bolas''s citadel (pwar) 79p';

-- repair: breach the multiverse (pmom) 94p → Breach the Multiverse
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Breach the Multiverse'
WHERE name = 'breach the multiverse (pmom) 94p';

-- repair: brightclimb pathway → Brightclimb Pathway // Grimclimb Pathway
--   Wrapper punctuation can be stripped to a single known card name.
UPDATE public.scryfall_cache
SET name = 'Brightclimb Pathway // Grimclimb Pathway'
WHERE name = 'brightclimb pathway';

-- repair: claim jumper (potj) 8p → Claim Jumper
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Claim Jumper'
WHERE name = 'claim jumper (potj) 8p';

-- repair: elspeth, storm slayer (ptdm) 11p → Elspeth, Storm Slayer
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Elspeth, Storm Slayer'
WHERE name = 'elspeth, storm slayer (ptdm) 11p';

-- repair: muraganda raceway (pdft) 257p → Muraganda Raceway
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Muraganda Raceway'
WHERE name = 'muraganda raceway (pdft) 257p';

-- repair: nessian wilds ravager (pbng) 129★ → Nessian Wilds Ravager
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Nessian Wilds Ravager'
WHERE name = 'nessian wilds ravager (pbng) 129★';

-- repair: priest of forgotten gods (prna) 83p → Priest of Forgotten Gods
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Priest of Forgotten Gods'
WHERE name = 'priest of forgotten gods (prna) 83p';

-- repair: resplendent angel (plci) 32p → Resplendent Angel
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Resplendent Angel'
WHERE name = 'resplendent angel (plci) 32p';

-- repair: silent hallcreeper (pdsk) 72p → Silent Hallcreeper
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Silent Hallcreeper'
WHERE name = 'silent hallcreeper (pdsk) 72p';

-- repair: thopter fabricator (pdft) 68p → Thopter Fabricator
--   Deterministic candidate from import_junk_pipeline matches a single canonical Scryfall name.
UPDATE public.scryfall_cache
SET name = 'Thopter Fabricator'
WHERE name = 'thopter fabricator (pdft) 68p';

-- -----------------------------------------------------------------------------
-- DELETES (0)
-- -----------------------------------------------------------------------------
-- (no delete statements — delete_candidate rows lacked confidence: high in source JSON)

ROLLBACK;

-- End preview (transaction rolled back if executed as-is)