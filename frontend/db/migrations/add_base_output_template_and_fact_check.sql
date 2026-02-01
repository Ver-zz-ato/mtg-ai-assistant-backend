-- Append REQUIRED OUTPUT TEMPLATE and HARD FACT-CHECK to BASE_UNIVERSAL_ENFORCEMENT
-- so the 3-layer system enforces high-signal, mechanically-correct output.

UPDATE prompt_layers
SET body = body || E'\n\n========================\nREQUIRED OUTPUT TEMPLATE (must follow exactly)\n========================\nStep 1: Archetype + Win Pattern\n- Archetype:\n- Win pattern:\n- Evidence (2–5 cards from list): [[...]], [[...]], ...\n\nStep 2: Pillar Snapshot (counts + evidence)\n- Ramp (count): Evidence (2–5): ...\n- Draw (count): Evidence (2–5): ...\n- Interaction (count, bucketed): Evidence (2–5): ...\n- Wincons (count): Evidence (2–5): ...\n\nStep 3: Problems (only if evidence-backed)\nFor each problem:\n- Problem ID (P1/P2/P3)\n- What breaks:\n- Evidence (2–5 cards from list): [[...]], ...\n\nStep 4: Turn Simulation (Commander 1–6)\nMust name real cards.\n\nStep 5: Upgrades (3–7)\nEach upgrade MUST be:\nADD [[X]] / CUT [[Y]]\nFixes: P#\nEvidence: 2–5 deck cards that prove the problem\nSynergy chain: "[[]] does X → [[]] triggers from X → together produce Z → advances win by …"\nQuality Gate:\n- Legal? yes/no\n- Identity ok? yes/no\n- Not already in deck? yes/no\n- Solves stated problem? yes/no\n- Fits curve/type plan? yes/no\n- Add/Cut present? yes/no\n\n========================\nHARD FACT-CHECK\n========================\n- Do not claim a card draws/ramps/removes unless it actually does. If unsure, say "unsure".',
  meta = COALESCE(meta, '{}'::jsonb) || '{"output_template_added":"2025-01"}'::jsonb,
  updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT';
