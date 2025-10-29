-- =======================================================================
-- IMPORT 15 DIVERSE PUBLIC COMMANDER DECKS
-- =======================================================================
-- STEP 1: Find your user_id: SELECT id FROM auth.users WHERE email = 'your@email.com';
-- STEP 2: Replace 990d69b2-3500-4833-81df-b05e07f929db in all queries below with that UUID

-- 1. Krenko - Goblin Tribal Aggro
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Krenko Goblin Army', 'Krenko, Mob Boss', 'Commander', 
$$1 Krenko, Mob Boss
1 Sol Ring
1 Goblin Chieftain
1 Siege-Gang Commander
1 Impact Tremors
1 Purphoros, God of the Forge
1 Coat of Arms
35 Mountain
1 Command Tower$$, 
true, '{"tags": ["Aggro", "Tribal", "Go-Wide"]}'::jsonb, NOW() - INTERVAL '45 days');

-- 2. Talrand - Control/Spellslinger
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Talrand Drake Control', 'Talrand, Sky Summoner', 'Commander',
$$1 Talrand, Sky Summoner
1 Sol Ring
1 Counterspell
1 Cyclonic Rift
1 Rhystic Study
30 Island
1 Command Tower$$,
true, '{"tags": ["Control", "Spellslinger", "Tempo"]}'::jsonb, NOW() - INTERVAL '52 days');

-- 3. Kinnan - Infinite Mana Combo
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Kinnan Infinite Mana', 'Kinnan, Bonder Prodigy', 'Commander',
$$1 Kinnan, Bonder Prodigy
1 Sol Ring
1 Basalt Monolith
1 Walking Ballista
10 Forest
10 Island
1 Command Tower$$,
true, '{"tags": ["Combo", "Ramp", "Competitive"]}'::jsonb, NOW() - INTERVAL '38 days');

-- 4. Sram - Voltron Equipment
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Sram Equipment Voltron', 'Sram, Senior Edificer', 'Commander',
$$1 Sram, Senior Edificer
1 Sol Ring
1 Sword of Fire and Ice
1 Lightning Greaves
1 Stoneforge Mystic
30 Plains
1 Command Tower$$,
true, '{"tags": ["Voltron", "Equipment", "Card Draw"]}'::jsonb, NOW() - INTERVAL '67 days');

-- 5. Edgar Markov - Vampire Tribal
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Edgar Vampire Horde', 'Edgar Markov', 'Commander',
$$1 Edgar Markov
1 Sol Ring
1 Elenda, the Dusk Rose
1 Coat of Arms
5 Plains
8 Swamp
5 Mountain
1 Command Tower$$,
true, '{"tags": ["Tribal", "Aggro", "Aristocrats"]}'::jsonb, NOW() - INTERVAL '89 days');

-- 6. Meren - Reanimator/Graveyard
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Meren Reanimator', 'Meren of Clan Nel Toth', 'Commander',
$$1 Meren of Clan Nel Toth
1 Sol Ring
1 Eternal Witness
1 Gray Merchant of Asphodel
1 Reanimate
8 Forest
8 Swamp
1 Command Tower$$,
true, '{"tags": ["Reanimator", "Graveyard", "Value Engine"]}'::jsonb, NOW() - INTERVAL '72 days');

-- 7. Atraxa - Superfriends
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Atraxa Planeswalkers', 'Atraxa, Praetors Voice', 'Commander',
$$1 Atraxa, Praetors Voice
1 Sol Ring
1 Doubling Season
1 Jace, the Mind Sculptor
5 Plains
5 Island
5 Swamp
5 Forest
1 Command Tower$$,
true, '{"tags": ["Superfriends", "Control", "Proliferate"]}'::jsonb, NOW() - INTERVAL '81 days');

-- 8. Zada - Token Storm
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Zada Token Storm', 'Zada, Hedron Grinder', 'Commander',
$$1 Zada, Hedron Grinder
1 Sol Ring
1 Crimson Wisps
1 Expedite
1 Young Pyromancer
35 Mountain
1 Command Tower$$,
true, '{"tags": ["Combo", "Storm", "Tokens"]}'::jsonb, NOW() - INTERVAL '94 days');

-- 9. Yuriko - Ninja Burn
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Yuriko Ninja Burn', 'Yuriko, the Tigers Shadow', 'Commander',
$$1 Yuriko, the Tigers Shadow
1 Sol Ring
1 Temporal Trespass
1 Scroll Rack
10 Island
10 Swamp
1 Command Tower$$,
true, '{"tags": ["Aggro", "Burn", "Evasion"]}'::jsonb, NOW() - INTERVAL '103 days');

-- 10. Gisela - Angel Tribal
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Gisela Angel Tribal', 'Gisela, Blade of Goldnight', 'Commander',
$$1 Gisela, Blade of Goldnight
1 Sol Ring
1 Aurelia, the Warleader
1 Avacyn, Angel of Hope
10 Plains
10 Mountain
1 Command Tower$$,
true, '{"tags": ["Tribal", "Midrange", "Angels"]}'::jsonb, NOW() - INTERVAL '115 days');

-- 11. Urza - Artifact Combo
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Urza Artifacts', 'Urza, Lord High Artificer', 'Commander',
$$1 Urza, Lord High Artificer
1 Sol Ring
1 Mana Crypt
1 Sensei's Divining Top
1 Paradox Engine
30 Island
1 Command Tower$$,
true, '{"tags": ["Combo", "Artifacts", "Competitive"]}'::jsonb, NOW() - INTERVAL '127 days');

-- 12. Omnath - Landfall
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Omnath Landfall', 'Omnath, Locus of Creation', 'Commander',
$$1 Omnath, Locus of Creation
1 Sol Ring
1 Avenger of Zendikar
1 Scapeshift
5 Plains
5 Island
5 Mountain
5 Forest
1 Command Tower$$,
true, '{"tags": ["Landfall", "Ramp", "Value Engine"]}'::jsonb, NOW() - INTERVAL '139 days');

-- 13. Korvold - Aristocrats/Sacrifice
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Korvold Sacrifice', 'Korvold, Fae-Cursed King', 'Commander',
$$1 Korvold, Fae-Cursed King
1 Sol Ring
1 Mayhem Devil
1 Pitiless Plunderer
1 Ashnod's Altar
8 Swamp
8 Mountain
8 Forest
1 Command Tower$$,
true, '{"tags": ["Aristocrats", "Sacrifice", "Value Engine"]}'::jsonb, NOW() - INTERVAL '151 days');

-- 14. Brago - Blink/ETB
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Brago Blink', 'Brago, King Eternal', 'Commander',
$$1 Brago, King Eternal
1 Sol Ring
1 Strionic Resonator
1 Venser, Shaper Savant
1 Cloudblazer
15 Plains
15 Island
1 Command Tower$$,
true, '{"tags": ["Blink", "Value Engine", "Control"]}'::jsonb, NOW() - INTERVAL '163 days');

-- 15. Chulane - Bant Value
INSERT INTO decks (user_id, title, commander, format, deck_text, is_public, meta, created_at)
VALUES ('990d69b2-3500-4833-81df-b05e07f929db', 'Chulane Value Engine', 'Chulane, Teller of Tales', 'Commander',
$$1 Chulane, Teller of Tales
1 Sol Ring
1 Aluren
1 Shrieking Drake
1 Eternal Witness
10 Plains
10 Island
10 Forest
1 Command Tower$$,
true, '{"tags": ["Value Engine", "Blink", "Combo"]}'::jsonb, NOW() - INTERVAL '175 days');

-- =======================================================================
-- VERIFICATION: After import, check your decks:
-- SELECT title, commander, is_public, meta, created_at FROM decks WHERE user_id = '990d69b2-3500-4833-81df-b05e07f929db' ORDER BY created_at DESC;
-- =======================================================================
