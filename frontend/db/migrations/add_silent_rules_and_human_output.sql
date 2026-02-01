-- Part 1–2: SILENT RULES (do not print) + human-friendly output shape in template.
-- Run after update_prompt_layers_no_simulation_human_friendly.sql.
-- No schema changes.

-- 1) Append SILENT RULES block to BASE (global, all formats)
UPDATE prompt_layers
SET body = body || E'\n\n========================\nSILENT RULES — DO NOT PRINT\n========================\nAll rules, constraints, validation logic, and formatting requirements are internal only.\nNever mention or imply:\n- That a rule exists\n- That validation is happening\n- That cards must or must not meet conditions\n- That sections have requirements\n- Any wording like "must include", "only cards already in list", "if needed", "quality gate", "evidence requirement"\nThe output must read as natural human analysis, not a checklist.',
  meta = COALESCE(meta, '{}'::jsonb) || '{"silent_rules":"2025-01"}'::jsonb,
  updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT';

-- 2) Human-friendly phrasing in REQUIRED OUTPUT TEMPLATE (replace instructional with natural)
UPDATE prompt_layers
SET body = replace(body,
  E'- Why (1 sentence)\n- Because (2–4 evidence cards): [[...]], [[...]]\n- Synergy chain (ONE line in this exact form):',
  E'- Why this helps:\n- Because you already run: [[...]], [[...]]\n- Synergy:'
),
updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT';

UPDATE prompt_layers
SET body = replace(body,
  E'Step 5: Synergy Chains (2 total)\n- Chain A (must use ONLY cards already in list):\n- Chain B (may include 1 new card if needed):',
  E'Step 5: Synergy Chains (2 total)\n- Chain A (cards already in your list):\n- Chain B (optional new card if it fits):'
),
updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT';

UPDATE prompt_layers
SET body = replace(body,
  E'Each upgrade MUST be:\nADD [[X]] / CUT [[Y]]\n- Fixes: P#',
  E'Each upgrade:\nADD [[X]] / CUT [[Y]]\n- Fixes: P#'
),
updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT';
