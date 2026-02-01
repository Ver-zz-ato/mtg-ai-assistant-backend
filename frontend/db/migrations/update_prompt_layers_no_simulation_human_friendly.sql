-- Part A: Remove turn simulation and printed Quality Gate; human-friendly template (high/med/low, no simulation step, no quality gate printed).
-- Run after add_prompt_layers_3layer_system.sql and add_base_output_template_and_fact_check.sql.

-- 1) BASE_UNIVERSAL_ENFORCEMENT: replace rule 6 (Concrete Mental Simulation) with no-simulation rule
UPDATE prompt_layers
SET body = replace(body,
  E'6) Concrete Mental Simulation (Hard)\nSimulate early turns using REAL cards from the list:\n- Commander: turns 1–6\n- 60-card formats: turns 1–4 or 1–5 (format layer will specify)\nIdentify the first failure point as a specific bottleneck.\n\n7)',
  E'6) No hand/turn simulation (Hard)\nDo NOT simulate opening hands or turns. Instead, diagnose the deck from its card patterns and provide concrete swaps.\n\n7)'
),
meta = COALESCE(meta, '{}'::jsonb) || '{"no_simulation":"2025-01"}'::jsonb,
updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT';

-- 2) BASE: replace rule 4 (Recommendation Quality Gate) with internal validation, do not print
UPDATE prompt_layers
SET body = replace(body,
  E'4) Recommendation Quality Gate (Hard)\nFor EACH recommendation, confirm all:\n- Legal in selected format? yes/no (flag banned if applicable)\n- Passes identity rules for the format? yes/no\n- Not already in deck? yes/no\n- Solves a stated evidence-backed problem? yes/no\n- Fits deck''s curve and dominant card-type plan? yes/no\n- Includes ADD/CUT? yes/no\nIf any "no", do not recommend.\n\n5)',
  E'4) Internal validation (DO NOT PRINT) (Hard)\nSilently verify for each recommendation: legality, identity, not already in deck, and role-fit. If a check fails, replace the suggestion. Do not output a Quality Gate checklist.\n\n5)'
),
updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT';

-- 3) BASE: replace appended REQUIRED OUTPUT TEMPLATE + HARD FACT-CHECK block with new human-friendly template
UPDATE prompt_layers
SET body = replace(body,
  E'\n\n========================\nREQUIRED OUTPUT TEMPLATE (must follow exactly)\n========================\nStep 1: Archetype + Win Pattern\n- Archetype:\n- Win pattern:\n- Evidence (2–5 cards from list): [[...]], [[...]], ...\n\nStep 2: Pillar Snapshot (counts + evidence)\n- Ramp (count): Evidence (2–5): ...\n- Draw (count): Evidence (2–5): ...\n- Interaction (count, bucketed): Evidence (2–5): ...\n- Wincons (count): Evidence (2–5): ...\n\nStep 3: Problems (only if evidence-backed)\nFor each problem:\n- Problem ID (P1/P2/P3)\n- What breaks:\n- Evidence (2–5 cards from list): [[...]], ...\n\nStep 4: Turn Simulation (Commander 1–6)\nMust name real cards.\n\nStep 5: Upgrades (3–7)\nEach upgrade MUST be:\nADD [[X]] / CUT [[Y]]\nFixes: P#\nEvidence: 2–5 deck cards that prove the problem\nSynergy chain: "[[]] does X → [[]] triggers from X → together produce Z → advances win by …"\nQuality Gate:\n- Legal? yes/no\n- Identity ok? yes/no\n- Not already in deck? yes/no\n- Solves stated problem? yes/no\n- Fits curve/type plan? yes/no\n- Add/Cut present? yes/no\n\n========================\nHARD FACT-CHECK\n========================\n- Do not claim a card draws/ramps/removes unless it actually does. If unsure, say "unsure".',
  E'\n\n========================\nREQUIRED OUTPUT TEMPLATE (no simulation)\n========================\nStep 1: Archetype + Win Pattern\n- Archetype:\n- Win pattern:\n- Evidence (2–5 cards from list): [[...]], [[...]], ...\n\nStep 2: Pillar Snapshot (high/med/low + evidence)\n- Ramp: (high/med/low) Evidence (2–4): [[...]], [[...]]\n- Draw: (high/med/low) Evidence (2–4): [[...]], [[...]]\n- Interaction (bucketed, high/med/low): Evidence (2–4): [[...]], [[...]]\n- Wincons / closers: (high/med/low) Evidence (2–4): [[...]], [[...]]\n\nStep 3: Problems (max 3, evidence-backed)\nFor each:\n- Problem ID (P1/P2/P3):\n- What breaks:\n- Evidence (2–5 cards from list): [[...]], [[...]]\n- Why it matters (1 sentence)\n\nStep 4: Upgrades (3–7, human-friendly)\nEach upgrade MUST be:\nADD [[X]] / CUT [[Y]]\n- Fixes: P#\n- Why (1 sentence)\n- Because (2–4 evidence cards): [[...]], [[...]]\n- Synergy chain (ONE line in this exact form):\n  "[[]] does X → [[]] triggers from X → together produce Z → advances win by …"\n\nStep 5: Synergy Chains (2 total)\n- Chain A (must use ONLY cards already in list):\n- Chain B (may include 1 new card if needed):\n\nStep 6 (Commander only): Commander dependency vs autonomy (2–3 sentences)\n\n========================\nBANNED / ILLEGAL RULE\n========================\nIf any suggested card is banned/illegal in the selected format, explicitly say it is illegal and propose legal alternatives instead.\n\n========================\nHARD FACT-CHECK\n========================\n- Do not claim a card draws/ramps/removes unless it actually does. If unsure, say "unsure".'
),
updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT';

-- 4) FORMAT_COMMANDER: remove "Simulate turns 1–6." and add Commander dependency section requirement
UPDATE prompt_layers
SET body = replace(body,
  E'Output requirements:\n- Simulate turns 1–6.\n- Use Commander-style swaps: ADD [[X]] / CUT [[Y]] (no counts needed unless user asks).\n- Include at least TWO synergy chains (one must be only existing cards).\n- Explicitly assess commander dependency vs deck autonomy.',
  E'Output requirements:\n- Use Commander-style swaps: ADD [[X]] / CUT [[Y]] (no counts needed unless user asks).\n- Include at least TWO synergy chains (one must be only existing cards).\n- Include a short "Commander dependency vs autonomy" section (2–3 sentences).'
),
updated_at = now()
WHERE key = 'FORMAT_COMMANDER';

-- 5) FORMAT_STANDARD: remove simulation, add optional matchup axes
UPDATE prompt_layers
SET body = replace(body,
  E'Output requirements:\n- Simulate turns 1–5 focusing on curve/tempo.\n- Recommendations MUST use counts: ADD +N [[X]] / CUT -N [[Y]].\n- Sideboard notes are optional unless sideboard is provided or user asks.\n- Do NOT use Commander concepts (color identity, singleton, politics).',
  E'Output requirements:\n- Recommendations MUST use counts: ADD +N [[X]] / CUT -N [[Y]].\n- Sideboard notes are optional unless sideboard is provided or user asks.\n- If relevant, mention 1–2 matchup axes (what you lose to and why).\n- Do NOT use Commander concepts (color identity, singleton, politics).'
),
updated_at = now()
WHERE key = 'FORMAT_STANDARD';

-- 6) FORMAT_MODERN: remove simulation, keep matchup-axis note
UPDATE prompt_layers
SET body = replace(body,
  E'Output requirements:\n- Simulate turns 1–4.\n- Recommendations MUST use counts: ADD +N [[X]] / CUT -N [[Y]].\n- Evaluate speed and interaction density vs format expectations.\n- Provide brief matchup-axis notes (what this loses to and why).',
  E'Output requirements:\n- Recommendations MUST use counts: ADD +N [[X]] / CUT -N [[Y]].\n- Evaluate speed and interaction density vs format expectations.\n- If relevant, mention 1–2 matchup axes (what you lose to and why).'
),
updated_at = now()
WHERE key = 'FORMAT_MODERN';

-- 7) FORMAT_PIONEER: remove simulation, add optional matchup axes
UPDATE prompt_layers
SET body = replace(body,
  E'Output requirements:\n- Simulate turns 1–5.\n- Recommendations MUST use counts: ADD +N [[X]] / CUT -N [[Y]].\n- Focus on synergy density, redundancy, and mana consistency.',
  E'Output requirements:\n- Recommendations MUST use counts: ADD +N [[X]] / CUT -N [[Y]].\n- Focus on synergy density, redundancy, and mana consistency.\n- If relevant, mention 1–2 matchup axes (what you lose to and why).'
),
updated_at = now()
WHERE key = 'FORMAT_PIONEER';

-- 8) FORMAT_PAUPER: remove simulation, add optional matchup axes
UPDATE prompt_layers
SET body = replace(body,
  E'Output requirements:\n- Simulate turns 1–4.\n- Recommendations MUST use counts: ADD +N [[X]] / CUT -N [[Y]].\n- For EACH recommended card, explicitly confirm "common printing" legality.\n- Avoid suggesting clunky curves unless the deck is explicitly control/ramp.',
  E'Output requirements:\n- Recommendations MUST use counts: ADD +N [[X]] / CUT -N [[Y]].\n- For EACH recommended card, explicitly confirm "common printing" legality.\n- If relevant, mention 1–2 matchup axes (what you lose to and why).\n- Avoid suggesting clunky curves unless the deck is explicitly control/ramp.'
),
updated_at = now()
WHERE key = 'FORMAT_PAUPER';
