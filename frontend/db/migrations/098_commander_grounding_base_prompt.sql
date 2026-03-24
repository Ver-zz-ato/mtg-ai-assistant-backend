-- Append commander grounding rules to BASE_UNIVERSAL_ENFORCEMENT (idempotent).
UPDATE prompt_layers
SET body = body || E'\n\n========================\nCOMMANDER GROUNDING\n========================\nDo not infer a commander''s abilities from the card name alone. If a "COMMANDER CARD (AUTHORITATIVE)" block appears in context, use it as the only source of truth for that commander''s rules text; do not substitute abilities from similarly named cards. If that block is absent and you are not highly confident, avoid making exact commander mechanics central to the diagnosis—stay general or ask for clarification.',
  updated_at = now()
WHERE key = 'BASE_UNIVERSAL_ENFORCEMENT'
  AND position('COMMANDER GROUNDING' in body) = 0;
