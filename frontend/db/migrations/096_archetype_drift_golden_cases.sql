-- Archetype drift golden cases: uses new expectedChecks (expectedPrimaryArchetype, mustNotClassifyAs, etc.)
-- See docs AI_TEST_SUITE_BREAKDOWN.md for schema.

INSERT INTO ai_test_cases (name, type, input, expected_checks, tags, source)
SELECT name, type, input::jsonb, expected_checks::jsonb, tags, source
FROM (VALUES
-- 1. Flash / opponent-turn shell with tribal overlap — must identify flash tempo, not elfball
('Archetype: Flash tempo (not elfball)', 'deck_analysis',
 '{"deckText": "1 Yeva, Nature''s Herald\n1 Seedborn Muse\n1 Wilderness Reclamation\n1 Vedalken Orrery\n1 Leyline of Anticipation\n1 Rhystic Study\n1 Cyclonic Rift\n1 Craterhoof Behemoth\n1 Elvish Mystic\n1 Llanowar Elves\n1 Fyndhorn Elves", "format": "Commander", "commander": "Yeva, Nature''s Herald"}',
 '{"expectedPrimaryArchetype": "flash", "expectedArchetypeAliases": ["flash tempo", "reactive flash", "opponent turn", "hold up"], "mustNotClassifyAs": ["elfball", "go-wide", "elf tribal"], "expectedGamePlanKeywords": ["flash", "opponents'' turns", "hold up", "reactive"], "wrongArchetypeKeywords": ["elfball", "go-wide elves"]}',
 ARRAY['archetype', 'flash', 'commander'],
 'curated'),

-- 2. Classic elfball go-wide
('Archetype: Elfball go-wide', 'deck_analysis',
 '{"deckText": "1 Marwyn, the Nurturer\n1 Ezuri, Renegade Leader\n1 Heritage Druid\n1 Priest of Titania\n1 Elvish Archdruid\n1 Craterhoof Behemoth\n1 Beastmaster Ascension\n1 Timberwatch Elf\n1 Lys Alana Huntmaster\n1 Imperious Perfect", "format": "Commander", "commander": "Marwyn, the Nurturer"}',
 '{"expectedPrimaryArchetype": "elfball", "expectedArchetypeAliases": ["elf tribal", "go-wide", "elf mana"], "expectedGamePlanKeywords": ["elf", "mana dork", "overrun", "go-wide"], "expectedSecondaryThemes": ["ramp from elves"]}',
 ARRAY['archetype', 'elfball', 'commander'],
 'curated'),

-- 3. True aristocrats shell
('Archetype: Aristocrats sacrifice', 'deck_analysis',
 '{"deckText": "1 Teysa Karlov\n1 Blood Artist\n1 Zulaport Cutthroat\n1 Viscera Seer\n1 Carrion Feeder\n1 Bastion of Remembrance\n1 Ashnod''s Altar\n1 Phyrexian Altar\n1 Dictate of Erebos\n1 Grave Pact", "format": "Commander", "commander": "Teysa Karlov"}',
 '{"expectedPrimaryArchetype": "aristocrats", "expectedArchetypeAliases": ["sacrifice", "sac outlets", "death triggers"], "expectedGamePlanKeywords": ["sacrifice", "sac outlet", "death trigger", "Blood Artist"], "forbiddenRecommendationPackages": []}',
 ARRAY['archetype', 'aristocrats', 'commander'],
 'curated'),

-- 4. Incidental sacrifice — must NOT be called aristocrats
('Archetype: Incidental sac (NOT aristocrats)', 'deck_analysis',
 '{"deckText": "1 Meren of Clan Nel Toth\n1 Solemn Simulacrum\n1 Sakura-Tribe Elder\n1 Burnished Hart\n1 Altar of Dementia\n1 Greater Good\n1 Life from the Loam\n1 Eternal Witness\n1 Phyrexian Delver\n1 Reanimate", "format": "Commander", "commander": "Meren of Clan Nel Toth"}',
 '{"expectedPrimaryArchetype": "graveyard recursion", "expectedArchetypeAliases": ["reanimator", "recursion", "value reanimator"], "mustNotClassifyAs": ["aristocrats"], "wrongArchetypeKeywords": ["aristocrats", "sacrifice deck"], "expectedGamePlanKeywords": ["graveyard", "recursion", "reanimate", "value"]}',
 ARRAY['archetype', 'graveyard', 'commander'],
 'curated'),

-- 5. Hybrid deck — must describe as hybrid
('Archetype: Hybrid deck', 'deck_analysis',
 '{"deckText": "1 Kykar, Wind''s Fury\n1 Young Pyromancer\n1 Monastery Mentor\n1 Talrand\n1 Guttersnipe\n1 Purphoros, God of the Forge\n1 Impact Tremors\n1 Anointed Procession\n1 Bitterblossom\n1 Shark Typhoon", "format": "Commander", "commander": "Kykar, Wind''s Fury"}',
 '{"mustDescribeAsHybrid": true, "expectedSecondaryThemes": ["tokens", "spellslinger", "spell tokens"], "expectedGamePlanKeywords": ["token", "spell", "spirit"], "wrongArchetypeKeywords": ["pure spellslinger", "pure go-wide"]}',
 ARRAY['archetype', 'hybrid', 'commander'],
 'curated'),

-- 6. Tribal density but off-tribe gameplay — faeries with control, not generic tribal
('Archetype: Tribal density off-tribe plan', 'deck_analysis',
 '{"deckText": "1 Oona, Queen of the Fae\n1 Faerie Tauntings\n1 Vendilion Clique\n1 Bitterblossom\n1 Scion of Oona\n1 Spellstutter Sprite\n1 Counterspell\n1 Mana Drain\n1 Cyclonic Rift\n1 Rhystic Study", "format": "Commander", "commander": "Oona, Queen of the Fae"}',
 '{"expectedPrimaryArchetype": "faerie", "expectedArchetypeAliases": ["faerie control", "tempo control"], "expectedSecondaryThemes": ["control", "counterspell"], "mustNotClassifyAs": ["generic go-wide", "tribal swarm"], "forbiddenRecommendationPackages": ["generic overrun finishers"]}',
 ARRAY['archetype', 'faerie', 'commander'],
 'curated')
) AS new_cases(name, type, input, expected_checks, tags, source)
WHERE NOT EXISTS (
  SELECT 1 FROM ai_test_cases WHERE ai_test_cases.name = new_cases.name
);
