-- Add new test cases for archetype-specific behaviors
-- These test cases cover: aristocrats, landfall, graveyard, enchantress, manabase, mulligan

-- Insert test cases, skipping any that already exist by name
INSERT INTO ai_test_cases (name, type, input, expected_checks, tags, source)
SELECT 
  name,
  type,
  input::jsonb,
  expected_checks::jsonb,
  tags,
  source
FROM (VALUES
-- Aristocrats (Sacrifice) Synergy Recognition
('Aristocrats: Should recognize sacrifice synergies', 'chat', 
 '{"userMessage": "I have a Rakdos deck with Blood Artist, Zulaport Cutthroat, and Viscera Seer. What cards should I add?"}',
 '{"shouldContain": ["sacrifice", "aristocrat", "Blood Artist", "Zulaport"], "shouldNotContain": ["ramp", "land"]}',
 ARRAY['aristocrats', 'synergy', 'commander'],
 'curated'),

('Aristocrats: Should suggest sacrifice outlets', 'chat',
 '{"userMessage": "My Teysa Karlov deck needs more ways to sacrifice creatures. What should I add?"}',
 '{"shouldContain": ["sacrifice", "outlet", "Viscera Seer", "Ashnod", "Altar"], "minLength": 100}',
 ARRAY['aristocrats', 'commander'],
 'curated'),

-- Landfall Deck Heuristics
('Landfall: Should recognize landfall strategy', 'deck_analysis',
 '{"deckText": "1 Omnath, Locus of Rage\n1 Rampaging Baloths\n1 Avenger of Zendikar\n1 Tireless Tracker\n1 Lotus Cobra\n1 Scute Swarm", "format": "Commander", "commander": "Omnath, Locus of Rage"}',
 '{"shouldContain": ["landfall", "land"], "minRampMention": 1}',
 ARRAY['landfall', 'commander', 'synergy'],
 'curated'),

('Landfall: Should suggest landfall enablers', 'chat',
 '{"userMessage": "I want to build a landfall deck with Tatyova. What cards work well?"}',
 '{"shouldContain": ["landfall", "Tatyova", "land"], "shouldNotContain": ["fast mana", "Mana Crypt"]}',
 ARRAY['landfall', 'commander'],
 'curated'),

-- Graveyard Recursion Heuristics
('Graveyard: Should recognize recursion strategy', 'deck_analysis',
 '{"deckText": "1 Meren of Clan Nel Toth\n1 Reanimate\n1 Animate Dead\n1 Living Death\n1 Eternal Witness\n1 Phyrexian Delver", "format": "Commander", "commander": "Meren of Clan Nel Toth"}',
 '{"shouldContain": ["graveyard", "recursion", "reanimate"], "minSynergyScore": 70}',
 ARRAY['graveyard', 'recursion', 'commander'],
 'curated'),

('Graveyard: Should suggest recursion enablers', 'chat',
 '{"userMessage": "My Muldrotha deck needs more ways to get cards into the graveyard. What should I add?"}',
 '{"shouldContain": ["graveyard", "mill", "discard", "entomb"], "shouldNotContain": ["exile"]}',
 ARRAY['graveyard', 'commander'],
 'curated'),

-- Enchantress (Enchantment-Matter) Heuristics
('Enchantress: Should recognize enchantment synergy', 'deck_analysis',
 '{"deckText": "1 Sythis, Harvest Hand\n1 Enchantress Presence\n1 Argothian Enchantress\n1 Mesa Enchantress\n1 Sigil of the Empty Throne\n1 Starfield of Nyx", "format": "Commander", "commander": "Sythis, Harvest Hand"}',
 '{"shouldContain": ["enchantment", "enchantress", "draw"], "minDrawMention": 1}',
 ARRAY['enchantress', 'commander', 'synergy'],
 'curated'),

('Enchantress: Should suggest enchantment payoffs', 'chat',
 '{"userMessage": "I have a Sythis enchantress deck. What are the best enchantments to add?"}',
 '{"shouldContain": ["enchantment", "enchantress", "draw"], "shouldNotContain": ["creature", "instant"]}',
 ARRAY['enchantress', 'commander'],
 'curated'),

-- Manabase Quality Checks
('Manabase: Should flag low basic land count', 'deck_analysis',
 '{"deckText": "1 Command Tower\n1 Fabled Passage\n1 Evolving Wilds\n1 Terramorphic Expanse\n1 Sol Ring", "format": "Commander", "colors": ["R", "G"]}',
 '{"mustFlagLowLands": true, "shouldContain": ["land", "basic", "33", "35", "36", "37"]}',
 ARRAY['manabase', 'lands', 'commander'],
 'curated'),

('Manabase: Should check dual land types', 'deck_analysis',
 '{"deckText": "1 Steam Vents\n1 Breeding Pool\n1 Stomping Ground\n1 Blood Crypt\n1 Overgrown Tomb", "format": "Commander", "colors": ["R", "G", "U", "B"]}',
 '{"shouldContain": ["dual", "shock", "fetch"], "shouldNotContain": ["basic"]}',
 ARRAY['manabase', 'lands', 'commander'],
 'curated'),

('Manabase: Should suggest fetch density', 'chat',
 '{"userMessage": "How many fetch lands should I run in my 5-color Commander deck?"}',
 '{"shouldContain": ["fetch", "8", "9", "10", "11", "12"], "minLength": 50}',
 ARRAY['manabase', 'commander'],
 'curated'),

('Manabase: Should check basics ratio', 'deck_analysis',
 '{"deckText": "1 Forest\n1 Mountain\n1 Command Tower\n1 Fabled Passage", "format": "Commander", "colors": ["R", "G"]}',
 '{"mustFlagLowLands": true, "shouldContain": ["basic", "land"]}',
 ARRAY['manabase', 'lands', 'commander'],
 'curated'),

-- Mulligan Logic Consistency
('Mulligan: Should provide consistent mulligan advice', 'chat',
 '{"userMessage": "When should I mulligan in Commander? I have 7 lands and 3 spells in my opening hand."}',
 '{"shouldContain": ["mulligan", "land", "spell", "curve"], "minLength": 80}',
 ARRAY['mulligan', 'commander'],
 'curated'),

('Mulligan: Should check hand quality heuristics', 'chat',
 '{"userMessage": "I have 2 lands, 1 ramp, 1 draw, and 3 expensive spells (6+ mana). Should I mulligan?"}',
 '{"shouldContain": ["mulligan", "yes", "should", "land", "curve"], "minLength": 60}',
 ARRAY['mulligan', 'commander'],
 'curated'),

('Mulligan: Should be consistent across formats', 'chat',
 '{"userMessage": "When should I mulligan in Modern vs Commander?"}',
 '{"shouldContain": ["mulligan", "Modern", "Commander", "different"], "minLength": 100}',
 ARRAY['mulligan', 'modern', 'commander'],
 'curated')
) AS new_cases(name, type, input, expected_checks, tags, source)
WHERE NOT EXISTS (
  SELECT 1 FROM ai_test_cases WHERE ai_test_cases.name = new_cases.name
);

