-- AI Test V3 Platform: unified evaluation workspace (V1–V5 suites)
-- Migration 090

-- ========== SUITES ==========
CREATE TABLE IF NOT EXISTS ai_test_suites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key IN ('v1', 'v2', 'v3', 'v4', 'v5')),
  title text NOT NULL,
  description text,
  is_model_backed boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_test_suites_key ON ai_test_suites(key);

-- ========== SCENARIOS ==========
CREATE TABLE IF NOT EXISTS ai_test_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_key text NOT NULL REFERENCES ai_test_suites(key) ON DELETE CASCADE,
  scenario_key text NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  tags text[] DEFAULT '{}',
  scenario_definition_json jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(suite_key, scenario_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_test_scenarios_suite ON ai_test_scenarios(suite_key);
CREATE INDEX IF NOT EXISTS idx_ai_test_scenarios_category ON ai_test_scenarios(category);
CREATE INDEX IF NOT EXISTS idx_ai_test_scenarios_active ON ai_test_scenarios(is_active) WHERE is_active = true;

-- ========== RUNS ==========
CREATE TABLE IF NOT EXISTS ai_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_key text NOT NULL,
  run_mode text NOT NULL CHECK (run_mode IN ('single', 'filtered', 'full', 'regression', 'scheduled')),
  model_name text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  total integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  warned integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  hard_failures integer NOT NULL DEFAULT 0,
  soft_failures integer NOT NULL DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  summary_json jsonb DEFAULT '{}',
  meta jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ai_test_runs_suite ON ai_test_runs(suite_key);
CREATE INDEX IF NOT EXISTS idx_ai_test_runs_started ON ai_test_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_test_runs_status ON ai_test_runs(status);

-- ========== RUN RESULTS (per-scenario result; avoid clash with existing ai_test_results) ==========
CREATE TABLE IF NOT EXISTS ai_test_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES ai_test_runs(id) ON DELETE CASCADE,
  scenario_id uuid REFERENCES ai_test_scenarios(id) ON DELETE SET NULL,
  suite_key text NOT NULL,
  scenario_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('PASS', 'WARN', 'FAIL', 'HARD_FAIL')),
  score_json jsonb DEFAULT '{}',
  hard_failures_json jsonb DEFAULT '[]',
  soft_failures_json jsonb DEFAULT '[]',
  prompt_excerpt text,
  output_text text,
  validator_findings_json jsonb DEFAULT '[]',
  debug_json jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_test_run_results_run ON ai_test_run_results(run_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_run_results_scenario ON ai_test_run_results(scenario_id);
CREATE INDEX IF NOT EXISTS idx_ai_test_run_results_status ON ai_test_run_results(status);

-- ========== REGRESSIONS ==========
CREATE TABLE IF NOT EXISTS ai_test_regressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_run_id uuid REFERENCES ai_test_runs(id) ON DELETE SET NULL,
  source_result_id uuid REFERENCES ai_test_run_results(id) ON DELETE SET NULL,
  title text NOT NULL,
  bug_type text,
  scenario_definition_json jsonb NOT NULL DEFAULT '{}',
  expected_fix_notes text,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_test_regressions_active ON ai_test_regressions(is_active) WHERE is_active = true;

-- ========== IMPROVEMENT SUGGESTIONS ==========
CREATE TABLE IF NOT EXISTS ai_test_improvement_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES ai_test_runs(id) ON DELETE SET NULL,
  source_result_ids_json jsonb DEFAULT '[]',
  scope text NOT NULL CHECK (scope IN ('prompt', 'rules', 'deck-intelligence', 'state', 'validator', 'ui')),
  suggestion_text text NOT NULL,
  rationale_text text,
  confidence numeric,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'implemented')),
  reviewer_note text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_test_improvement_suggestions_status ON ai_test_improvement_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_ai_test_improvement_suggestions_run ON ai_test_improvement_suggestions(run_id);

-- ========== RLS ==========
ALTER TABLE ai_test_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_test_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_test_run_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_test_regressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_test_improvement_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_test_suites_all" ON ai_test_suites;
CREATE POLICY "ai_test_suites_all" ON ai_test_suites FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_test_scenarios_all" ON ai_test_scenarios;
CREATE POLICY "ai_test_scenarios_all" ON ai_test_scenarios FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_test_runs_all" ON ai_test_runs;
CREATE POLICY "ai_test_runs_all" ON ai_test_runs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_test_run_results_all" ON ai_test_run_results;
CREATE POLICY "ai_test_run_results_all" ON ai_test_run_results FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_test_regressions_all" ON ai_test_regressions;
CREATE POLICY "ai_test_regressions_all" ON ai_test_regressions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_test_improvement_suggestions_all" ON ai_test_improvement_suggestions;
CREATE POLICY "ai_test_improvement_suggestions_all" ON ai_test_improvement_suggestions FOR ALL USING (true) WITH CHECK (true);

-- ========== SEED SUITES ==========
INSERT INTO ai_test_suites (key, title, description, is_model_backed, is_enabled) VALUES
  ('v1', 'Prompt Contract Tests', 'Checks correct prompt blocks, ordering, no contradictory contracts.', false, true),
  ('v2', 'Context / State Tests', 'ActiveDeckContext, commander inference, deck replacement, linked vs pasted.', false, true),
  ('v3', 'Behavioral Reasoning Tests', 'Rules correctness, deck reasoning, card accuracy, synergy, honesty.', true, true),
  ('v4', 'Adversarial Hallucination Tests', 'Hallucination resistance, bait prompts, color identity traps.', true, true),
  ('v5', 'Regression Library', 'Stored past failures; rerun to prevent regressions.', false, true)
ON CONFLICT (key) DO NOTHING;

-- ========== SEED V2 SCENARIOS (from lib/admin/ai-v2/scenarios — ids match SCENARIOS array) ==========
-- V2 scenario_definition_json stores { "v2ScenarioId": "<id>" } for runner lookup.
INSERT INTO ai_test_scenarios (suite_key, scenario_key, title, description, category, tags, scenario_definition_json, is_active)
SELECT 'v2', s.id, s.title, ''::text, s.category, '{}'::text[], jsonb_build_object('v2ScenarioId', s.id), true
FROM (VALUES
  ('state-001-paste-infer-confirm-follow', 'Paste deck → infer commander → confirm yes → follow-up uses confirmed commander', 'state_memory'),
  ('state-002-paste-infer-correct-follow', 'Paste deck → infer commander → correct commander → follow-up uses corrected commander', 'state_memory'),
  ('state-003-linked-follow-no-ask', 'Linked deck follow-up does not ask for decklist', 'state_memory'),
  ('state-004-linked-override-paste', 'Linked deck explicitly overridden by pasted deck', 'state_memory'),
  ('state-005-deck-replace-hash', 'New pasted deck replaces old deck hash and clears commander appropriately', 'state_memory'),
  ('rules-001-multani-commander', 'Multani can be commander', 'rules_legality'),
  ('rules-002-black-lotus-banned', 'Black Lotus banned in Commander', 'rules_legality'),
  ('rules-003-grist-commander', 'Grist commander eligibility', 'rules_legality'),
  ('rules-004-nonlegendary-no-commander', 'Nonlegendary creature cannot be commander', 'rules_legality'),
  ('rules-005-oracle-vs-physical', 'Oracle-vs-physical-print bait question', 'rules_legality'),
  ('deck-001-explain-ramp', 'Explain ramp mix in mono-green lands/ramp deck', 'deck_intelligence'),
  ('deck-002-identify-plan', 'Identify primary and secondary plan', 'deck_intelligence'),
  ('deck-003-missing-interaction', 'Identify missing interaction', 'deck_intelligence'),
  ('deck-004-tension-dorks-vs-land', 'Identify tension between mana dorks and land-matter shell', 'deck_intelligence'),
  ('deck-005-synergy-chain', 'Explain synergy chain like Scapeshift → Avenger → Craterhoof', 'deck_intelligence'),
  ('contract-001-rules-only', 'Rules question injects RULES FACTS only', 'prompt_contract'),
  ('contract-002-deck-only', 'Deck analysis injects DECK INTELLIGENCE only', 'prompt_contract'),
  ('contract-003-combined', 'Combined rules + deck injects both', 'prompt_contract'),
  ('contract-004-confirmed-commander-block', 'Confirmed commander injects CRITICAL commander block', 'prompt_contract'),
  ('contract-005-ask-confirmation', 'Missing commander injects ask-confirmation block', 'prompt_contract'),
  ('adversarial-001a-partial-with-strong-candidate', 'Partial decklist with strong commander candidate', 'adversarial'),
  ('adversarial-001b-partial-without-strong-candidate', 'Partial decklist without commander section', 'adversarial'),
  ('adversarial-002-same-deck-formatting', 'Same deck in altered formatting preserves effective identity', 'fuzz_formatting'),
  ('adversarial-003-another-deck-bait', 'For another deck... does not silently replace active thread deck', 'adversarial'),
  ('adversarial-004-messy-commander-header', 'Messy Commander header variant still detects commander', 'fuzz_formatting'),
  ('adversarial-005-color-identity-trap', 'Color identity trap scenario', 'adversarial')
) AS s(id, title, category)
ON CONFLICT (suite_key, scenario_key) DO NOTHING;

-- ========== SEED V1 (prompt contract — same as V2 contract-* for now) ==========
INSERT INTO ai_test_scenarios (suite_key, scenario_key, title, description, category, tags, scenario_definition_json, is_active)
SELECT 'v1', scenario_key, title, description, category, tags, scenario_definition_json, true
FROM ai_test_scenarios
WHERE suite_key = 'v2' AND category = 'prompt_contract'
ON CONFLICT (suite_key, scenario_key) DO NOTHING;

-- ========== SEED V3 BEHAVIORAL (12: 4 rules, 4 deck, 2 synergy, 2 honesty) ==========
INSERT INTO ai_test_scenarios (suite_key, scenario_key, title, description, category, tags, scenario_definition_json, is_active) VALUES
('v3', 'rules-001', 'Can Multani be a commander?', 'Rules: Multani, Yavimaya''s Avatar can be commander.', 'rules_correctness', ARRAY['rules','commander'], '{"userMessage":"Can [[Multani, Yavimaya''s Avatar]] be a commander?","expectedTraits":["yes","legal","commander"],"forbiddenTraits":["no","illegal"]}', true),
('v3', 'rules-002', 'Can Grist be a commander?', 'Rules: Grist can be commander via oracle.', 'rules_correctness', ARRAY['rules','commander'], '{"userMessage":"Can [[Grist, the Hunger Tide]] be a commander?","expectedTraits":["yes","commander"],"forbiddenTraits":["cannot"]}', true),
('v3', 'rules-003', 'Is Black Lotus legal in Commander?', 'Rules: Black Lotus is banned.', 'rules_correctness', ARRAY['rules','banned'], '{"userMessage":"Is [[Black Lotus]] legal in Commander?","expectedTraits":["banned","not legal"],"forbiddenTraits":["legal"]}', true),
('v3', 'rules-004', 'Avenger of Zendikar as commander', 'Rules: Nonlegendary cannot be commander.', 'rules_correctness', ARRAY['rules','commander'], '{"userMessage":"Can [[Avenger of Zendikar]] be a commander?","expectedTraits":["no","legendary"],"forbiddenTraits":["yes"]}', true),
('v3', 'deck-001', 'Explain ramp mix in this deck', 'Deck reasoning: ramp mix.', 'deck_reasoning', ARRAY['deck','ramp'], '{"userMessage":"Explain the ramp mix in my deck.","deckContext":"multani_mono_green","expectedTraits":["ramp","land"]}', true),
('v3', 'deck-002', 'Main weaknesses of this deck', 'Deck reasoning: weaknesses.', 'deck_reasoning', ARRAY['deck'], '{"userMessage":"What are the main weaknesses of this deck?","deckContext":"multani_mono_green","expectedTraits":["weakness","interaction"]}', true),
('v3', 'deck-003', 'Gameplan of this deck', 'Deck reasoning: gameplan.', 'deck_reasoning', ARRAY['deck'], '{"userMessage":"What''s the gameplan here?","deckContext":"multani_mono_green"}', true),
('v3', 'deck-004', 'Why are mana dorks awkward here?', 'Deck reasoning: dorks vs land theme.', 'deck_reasoning', ARRAY['deck'], '{"userMessage":"Why are mana dorks awkward here?","deckContext":"multani_mono_green"}', true),
('v3', 'synergy-001', 'Scapeshift Avenger Craterhoof line', 'Synergy: Scapeshift → Avenger → Craterhoof.', 'synergy_reasoning', ARRAY['synergy'], '{"userMessage":"Explain the Scapeshift + Avenger + Craterhoof line in my deck.","deckContext":"multani_mono_green","expectedTraits":["tokens","land"]}', true),
('v3', 'synergy-002', 'Splendid Reclamation matter here', 'Synergy: Splendid Reclamation.', 'synergy_reasoning', ARRAY['synergy'], '{"userMessage":"Why does Splendid Reclamation matter here?","deckContext":"multani_mono_green"}', true),
('v3', 'honesty-001', 'Card X not in deck', 'Honesty: do not analyze card not in deck as if in deck.', 'hallucination_avoidance', ARRAY['honesty'], '{"userMessage":"Why is Lightning Bolt bad in this deck?","deckContext":"multani_mono_green","forbiddenTraits":["lightning bolt"],"expectedTraits":["not in deck","don''t have"]}', true),
('v3', 'honesty-002', 'Off-color card question', 'Honesty: color identity answer.', 'hallucination_avoidance', ARRAY['honesty'], '{"userMessage":"Can I run off-color card [[Breeding Pool]] in this deck?","deckContext":"multani_mono_green","expectedTraits":["green","color identity"]}', true)
ON CONFLICT (suite_key, scenario_key) DO NOTHING;

-- ========== SEED V4 ADVERSARIAL (10) ==========
INSERT INTO ai_test_scenarios (suite_key, scenario_key, title, description, category, tags, scenario_definition_json, is_active) VALUES
('v4', 'adv-001', 'Nonexistent card in deck', 'Do not analyze invented card as if in deck.', 'hallucination', ARRAY['adversarial'], '{"userMessage":"How does [[FakeCard XYZ]] synergize with my deck?","deckContext":"multani_mono_green","expectedTraits":["don''t have","not in deck","unclear"],"forbiddenTraits":["synergy with FakeCard"]}', true),
('v4', 'adv-002', 'Partial decklist weak evidence', 'Do not overstate confidence from partial list.', 'hallucination', ARRAY['adversarial'], '{"userMessage":"I have 10 forests and 2 ramp spells. What should I add?","expectedTraits":["more information","decklist"],"forbiddenTraits":["your deck is"]}', true),
('v4', 'adv-003', 'Bait fake confidence', 'Resist answering as if we have full context.', 'bait', ARRAY['adversarial'], '{"userMessage":"So you agree my mana base is optimal?","expectedTraits":["see your deck","decklist"],"forbiddenTraits":["yes, your mana base is optimal"]}', true),
('v4', 'adv-004', 'Color identity trap', 'Do not suggest off-color cards.', 'color_identity', ARRAY['adversarial'], '{"userMessage":"Suggest a ramp spell.","deckContext":"multani_mono_green","forbiddenTraits":["Boros Signet","Rakdos Signet","Orzhov Signet"]}', true),
('v4', 'adv-005', 'Nonlegendary as commander', 'Must say no to nonlegendary commander.', 'rules_trap', ARRAY['adversarial'], '{"userMessage":"Can [[Llanowar Elves]] be my commander?","expectedTraits":["no","legendary"],"forbiddenTraits":["yes"]}', true),
('v4', 'adv-006', 'For another deck context bait', 'Do not replace active deck.', 'context_bait', ARRAY['adversarial'], '{"userMessage":"For another deck I''m building, is Sol Ring legal?","deckContext":"has_linked","expectedTraits":["yes","legal"],"forbiddenTraits":["your deck"]}', true),
('v4', 'adv-007', 'Contradictory user premise', 'Resist agreeing to contradiction.', 'contradiction', ARRAY['adversarial'], '{"userMessage":"My commander is both Multani and Atraxa. What colors can I run?","expectedTraits":["one commander","which"]}', true),
('v4', 'adv-008', 'Weird formatting', 'Parse messy input gracefully.', 'fuzz', ARRAY['adversarial'], '{"userMessage":"COMMANDER 1 multani yavimayas avatar\n\nDECK 35 forest"}', true),
('v4', 'adv-009', 'Partner edge case', 'Partner commanders: two commanders.', 'rules_edge', ARRAY['adversarial'], '{"userMessage":"Can I use both [[Thrasios]] and [[Tymna]] as commanders?","expectedTraits":["partner","two"],"forbiddenTraits":["only one"]}', true),
('v4', 'adv-010', 'Invented card name', 'Do not invent card analysis.', 'hallucination', ARRAY['adversarial'], '{"userMessage":"What do you think about [[Super Ultimatum of the Void]] in Commander?","expectedTraits":["not find","unclear","don''t know"],"forbiddenTraits":["great card","recommend"]}', true)
ON CONFLICT (suite_key, scenario_key) DO NOTHING;

-- ========== SEED V5 REGRESSION EXAMPLES (4 known historical issues) ==========
INSERT INTO ai_test_regressions (title, bug_type, scenario_definition_json, expected_fix_notes, severity, is_active) VALUES
('Commander confirmation lost after "yes"', 'state_memory', '{"v2ScenarioId":"state-001-paste-infer-confirm-follow"}', 'After user confirms commander with "yes", follow-up must use that commander; must not forget.', 'high', true),
('Stale commander surviving deck replacement', 'state_memory', '{"v2ScenarioId":"state-005-deck-replace-hash"}', 'When user pastes a completely new deck, commander and deck context must update; old commander must not persist.', 'high', true),
('Rules-only prompt asking for deck', 'prompt_contract', '{"v2ScenarioId":"contract-001-rules-only"}', 'Pure rules question must not inject DECK INTELLIGENCE or ask for decklist.', 'medium', true),
('Generic Multani fixture contamination', 'deck_intelligence', '{"v2ScenarioId":"deck-001-explain-ramp"}', 'Deck-specific answers must reference actual deck content, not generic template.', 'medium', true);
