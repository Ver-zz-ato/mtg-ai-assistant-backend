-- Test cases for AI Enhancement v2.0 features
-- These tests verify the new behaviors: archetype detection, problems-first analysis,
-- synergy-weighted suggestions, staple reduction, consistency, etc.

INSERT INTO ai_test_cases (name, type, input, expected_checks, tags, source)
SELECT 
  name,
  type,
  input::jsonb,
  expected_checks::jsonb,
  tags,
  source
FROM (VALUES
  -- Archetype Detection Tests
  ('Archetype Detection: Tokens', 'chat', 
   '{"userMessage": "I have a deck with Parallel Lives, Anointed Procession, and lots of token makers. What should I add?"}',
   '{"shouldContain": ["token", "go-wide", "tokens", "archetype"], "shouldNotContain": ["voltron", "combo"]}',
   ARRAY['archetype_detection', 'tokens'],
   'curated'),
  
  ('Archetype Detection: Aristocrats', 'chat', 
   '{"userMessage": "My deck has Blood Artist, Zulaport Cutthroat, and Viscera Seer. What cards work with this?"}',
   '{"shouldContain": ["aristocrat", "sacrifice", "death trigger"], "shouldNotContain": ["ramp", "land"]}',
   ARRAY['archetype_detection', 'aristocrats'],
   'curated'),
  
  ('Archetype Detection: Control', 'chat', 
   '{"userMessage": "I''m building a control deck with lots of counterspells and board wipes. What finishers should I use?"}',
   '{"shouldContain": ["control", "finisher", "late-game"], "shouldNotContain": ["aggro", "early game"]}',
   ARRAY['archetype_detection', 'control'],
   'curated'),

  -- Problems-First Analysis Tests
  ('Problems-First: Low Ramp', 'deck_analysis',
   '{"deckText": "1 Sol Ring\n1 Lightning Bolt\n1 Counterspell\n1 Wrath of God\n1 Serra Angel\n1 Shivan Dragon\n1 Force of Will\n1 Brainstorm\n1 Ponder\n1 Preordain\n1 Island\n1 Plains\n1 Mountain\n1 Forest\n1 Swamp", "format": "Commander", "userMessage": "What does this deck need?"}',
   '{"shouldContain": ["ramp", "mana", "problem"], "shouldNotContain": ["wincon", "draw"]}',
   ARRAY['problems_first', 'ramp'],
   'curated'),
  
  ('Problems-First: Weak Draw', 'deck_analysis',
   '{"deckText": "1 Sol Ring\n1 Arcane Signet\n1 Cultivate\n1 Kodama''s Reach\n1 Lightning Bolt\n1 Path to Exile\n1 Swords to Plowshares\n1 Wrath of God\n1 Serra Angel\n1 Shivan Dragon\n1 Island\n1 Plains\n1 Mountain\n1 Forest\n1 Swamp", "format": "Commander", "userMessage": "What does this deck need?"}',
   '{"shouldContain": ["draw", "card advantage", "problem"], "shouldNotContain": ["ramp", "mana"]}',
   ARRAY['problems_first', 'draw'],
   'curated'),
  
  ('Problems-First: No Wincons', 'deck_analysis',
   '{"deckText": "1 Sol Ring\n1 Arcane Signet\n1 Cultivate\n1 Kodama''s Reach\n1 Lightning Bolt\n1 Path to Exile\n1 Swords to Plowshares\n1 Wrath of God\n1 Brainstorm\n1 Ponder\n1 Preordain\n1 Island\n1 Plains\n1 Mountain\n1 Forest\n1 Swamp", "format": "Commander", "userMessage": "What does this deck need?"}',
   '{"shouldContain": ["wincon", "win condition", "close", "problem"], "shouldNotContain": ["ramp", "draw"]}',
   ARRAY['problems_first', 'wincons'],
   'curated'),

  -- Plan Restatement Tests
  ('Plan Restatement: Tokens Deck', 'chat',
   '{"userMessage": "I''m building a token deck with Krenko, Mob Boss. What should I add?"}',
   '{"shouldContain": ["token", "go-wide", "strategy"], "minLength": 100}',
   ARRAY['plan_restatement', 'tokens'],
   'curated'),
  
  ('Plan Restatement: Combo Deck', 'chat',
   '{"userMessage": "I want to build a combo deck around Thassa''s Oracle and Demonic Consultation. What else do I need?"}',
   '{"shouldContain": ["combo", "strategy", "plan"], "minLength": 100}',
   ARRAY['plan_restatement', 'combo'],
   'curated'),

  -- Synergy-Weighted Suggestions Tests
  ('Synergy-Weighted: Blink Deck', 'chat',
   '{"userMessage": "I have a blink deck with Brago, King Eternal. What cards should I add?"}',
   '{"shouldContain": ["ETB", "enters the battlefield", "blink", "flicker"], "shouldNotContain": ["static", "enchantment"]}',
   ARRAY['synergy_weighted', 'blink'],
   'curated'),
  
  ('Synergy-Weighted: Graveyard Deck', 'chat',
   '{"userMessage": "I''m building a graveyard deck with Meren of Clan Nel Toth. What should I add?"}',
   '{"shouldContain": ["graveyard", "reanimation", "recursion"], "shouldNotContain": ["exile", "shuffle"]}',
   ARRAY['synergy_weighted', 'graveyard'],
   'curated'),

  -- Staple Reduction Tests
  ('Staple Reduction: Casual Deck', 'chat',
   '{"userMessage": "I''m building a casual fun deck with a budget. What ramp should I use?", "format": "Commander", "budget": "budget"}',
   '{"shouldContain": ["Arcane Signet", "Fellwar Stone", "Mind Stone"], "shouldNotContain": ["Mana Crypt", "Jeweled Lotus", "Mox"]}',
   ARRAY['staple_reduction', 'budget'],
   'curated'),
  
  ('Staple Reduction: Thematic Over Staples', 'chat',
   '{"userMessage": "I have a goblin tribal deck. What should I add?", "format": "Commander"}',
   '{"shouldContain": ["goblin", "tribal", "synergy"], "shouldNotContain": ["Rhystic Study", "Smothering Tithe"]}',
   ARRAY['staple_reduction', 'thematic'],
   'curated'),

  -- Error-Catching Tests
  ('Error-Catching: No Mana Dorks in Non-Green', 'chat',
   '{"userMessage": "I have a mono-red deck. What ramp should I use?", "format": "Commander", "colors": ["R"]}',
   '{"shouldNotContain": ["Llanowar Elves", "Birds of Paradise", "Elvish Mystic", "mana dork"]}',
   ARRAY['error_catching', 'color_identity'],
   'curated'),
  
  ('Error-Catching: No 7+ Mana in Aggro', 'chat',
   '{"userMessage": "I have a low-curve aggro deck with lots of 1-3 mana creatures. What should I add?", "format": "Commander"}',
   '{"shouldNotContain": ["7", "8", "9", "10", "eleven", "twelve"]}',
   ARRAY['error_catching', 'curve'],
   'curated'),

  -- Casual vs Competitive Tests
  ('Casual vs Competitive: Casual Tone', 'chat',
   '{"userMessage": "I''m building a fun casual deck for kitchen table. What should I add?", "format": "Commander"}',
   '{"shouldContain": ["fun", "casual", "thematic"], "shouldNotContain": ["competitive", "cEDH", "oppressive"]}',
   ARRAY['casual_competitive', 'casual'],
   'curated'),
  
  ('Casual vs Competitive: Competitive Tone', 'chat',
   '{"userMessage": "I''m building a competitive cEDH deck. What should I add?", "format": "Commander"}',
   '{"shouldContain": ["efficient", "interaction", "resilient"], "shouldNotContain": ["fun", "casual", "janky"]}',
   ARRAY['casual_competitive', 'competitive'],
   'curated'),

  -- Internal Consistency Tests
  ('Internal Consistency: Ramp Count', 'chat',
   '{"userMessage": "I need 10 ramp pieces. Here are 3 suggestions.", "format": "Commander"}',
   '{"shouldContain": ["10", "ramp"], "shouldNotContain": ["3"]}',
   ARRAY['internal_consistency', 'numbers'],
   'curated'),
  
  ('Internal Consistency: Land Count', 'chat',
   '{"userMessage": "Commander decks need 35 lands. I have 30. What should I add?", "format": "Commander"}',
   '{"shouldContain": ["35", "land"], "shouldNotContain": ["30"]}',
   ARRAY['internal_consistency', 'numbers'],
   'curated'),

  -- Synergy Chains Tests
  ('Synergy Chains: Token Combo', 'chat',
   '{"userMessage": "I have Parallel Lives and Anointed Procession. What else works with these?", "format": "Commander"}',
   '{"shouldContain": ["together", "work", "synergy", "chain"], "minLength": 150}',
   ARRAY['synergy_chains', 'tokens'],
   'curated'),
  
  ('Synergy Chains: Graveyard Loop', 'chat',
   '{"userMessage": "I have Meren and Sheoldred, Whispering One. What else should I add?", "format": "Commander"}',
   '{"shouldContain": ["together", "work", "synergy", "chain"], "minLength": 150}',
   ARRAY['synergy_chains', 'graveyard'],
   'curated'),

  -- Mental Simulation Tests
  ('Mental Simulation: Curve Analysis', 'deck_analysis',
   '{"deckText": "1 Sol Ring\n1 Lightning Bolt\n1 Counterspell\n1 Wrath of God\n1 Serra Angel\n1 Shivan Dragon\n1 Force of Will\n1 Brainstorm\n1 Ponder\n1 Preordain\n1 Island\n1 Plains\n1 Mountain\n1 Forest\n1 Swamp", "format": "Commander", "userMessage": "How does this deck play?"}',
   '{"shouldContain": ["turn", "curve", "mana", "play"], "minLength": 100}',
   ARRAY['mental_simulation', 'curve'],
   'curated'),

  -- Bad Suggestion Filter Tests
  ('Bad Suggestion Filter: Off-Color', 'chat',
   '{"userMessage": "I have a mono-blue deck. What should I add?", "format": "Commander", "colors": ["U"]}',
   '{"shouldNotContain": ["Lightning Bolt", "Path to Exile", "Swords to Plowshares", "red", "white", "green", "black"]}',
   ARRAY['bad_suggestion_filter', 'color_identity'],
   'curated'),
  
  ('Bad Suggestion Filter: Banned Card', 'chat',
   '{"userMessage": "What should I add to my Commander deck?", "format": "Commander"}',
   '{"shouldNotContain": ["Ancestral Recall", "Black Lotus", "Time Walk", "banned"]}',
   ARRAY['bad_suggestion_filter', 'legality'],
   'curated')
) AS new_cases(name, type, input, expected_checks, tags, source)
WHERE NOT EXISTS (
  SELECT 1 FROM ai_test_cases WHERE ai_test_cases.name = new_cases.name
);

