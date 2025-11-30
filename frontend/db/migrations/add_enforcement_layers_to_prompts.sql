-- Add Global Enforcement Rules to Chat and Deck Analysis Prompts
-- This migration appends enforcement layers to the bottom of existing system prompts
-- Creates new versions with the appended content and sets them as active

-- ============================================
-- CHAT PROMPT: Append Global Enforcement Rules
-- ============================================

INSERT INTO prompt_versions (id, version, kind, system_prompt, meta, created_at)
SELECT 
  gen_random_uuid(),
  'v2.2-enforcement-chat-' || to_char(now(), 'YYYY-MM-DD-HH24-MI-SS'),
  'chat',
  -- Base prompt from current active version, with enforcement layers appended
  system_prompt || E'\n\n' || 
  E'🚨 GLOBAL ENFORCEMENT RULES (APPLY TO ALL ANSWERS)\n\n' ||
  E'Your answer is INVALID unless ALL of the following conditions are met:\n\n' ||
  E'The commander or key card is explicitly named in the answer.\n\n' ||
  E'You identify the deck''s archetype clearly (e.g. aristocrats, landfall, tribal, voltron, spellslinger, graveyard recursion, superfriends, stax, control, tokens, blink, midrange, combo, storm, etc.).\n\n' ||
  E'You explain at least one synergy chain, using wording like:\n' ||
  E'"X works with Y because…"\n' ||
  E'"A triggers B which enables C…"\n' ||
  E'"This combo functions when…"\n\n' ||
  E'You provide at least three specific, legal cards that fit:\n' ||
  E'the color identity\n' ||
  E'the format\n' ||
  E'the described archetype\n' ||
  E'the deck plan\n\n' ||
  E'Color identity must always be respected.\n\n' ||
  E'Format legality must always be respected (Commander banlist, Standard rotation, Modern legality, Brawl legality, etc.).\n\n' ||
  E'Your answer must address the user''s actual deck plan, not a generic structure.\n\n' ||
  E'You must NOT rely solely on a generic pillars list ("ramp / draw / removal / wincons").\n' ||
  E'These can be included only as support, never as the main structure.\n\n' ||
  E'Avoid all generic boilerplate or autopilot responses.\n\n' ||
  E'If the user provides insufficient detail, you MUST ask clarifying questions instead of guessing.\n\n' ||
  E'If any of these cannot be met, STOP and ask the user for clarification.\n' ||
  E'Do not produce a partial or generic answer.',
  jsonb_build_object(
    'source', 'enforcement-layers',
    'description', 'Added global enforcement rules to ensure specific, legal, archetype-aware answers',
    'improvements', jsonb_build_array('global_enforcement', 'archetype_identification', 'synergy_chains', 'specificity_requirement', 'legality_enforcement')
  ),
  NOW()
FROM prompt_versions
WHERE kind = 'chat'
ORDER BY created_at DESC
LIMIT 1
RETURNING id, version;

-- Set the new chat version as active
DO $$
DECLARE
  new_chat_version_id uuid;
  new_chat_version_name text;
BEGIN
  SELECT id, version INTO new_chat_version_id, new_chat_version_name
  FROM prompt_versions
  WHERE kind = 'chat'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF new_chat_version_id IS NOT NULL THEN
    INSERT INTO app_config (key, value)
    VALUES (
      'active_prompt_version_chat',
      jsonb_build_object('id', new_chat_version_id, 'version', new_chat_version_name)
    )
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('id', new_chat_version_id, 'version', new_chat_version_name);
    
    RAISE NOTICE 'Set % as active chat prompt', new_chat_version_name;
  END IF;
END $$;

-- ============================================
-- DECK ANALYSIS PROMPT: Append Global + Special Enforcement
-- ============================================

INSERT INTO prompt_versions (id, version, kind, system_prompt, meta, created_at)
SELECT 
  gen_random_uuid(),
  'v2.2-enforcement-deck-analysis-' || to_char(now(), 'YYYY-MM-DD-HH24-MI-SS'),
  'deck_analysis',
  -- Base prompt from current active version, with both enforcement layers appended
  system_prompt || E'\n\n' || 
  E'🚨 GLOBAL ENFORCEMENT RULES (APPLY TO ALL ANSWERS)\n\n' ||
  E'Your answer is INVALID unless ALL of the following conditions are met:\n\n' ||
  E'The commander or key card is explicitly named in the answer.\n\n' ||
  E'You identify the deck''s archetype clearly (e.g. aristocrats, landfall, tribal, voltron, spellslinger, graveyard recursion, superfriends, stax, control, tokens, blink, midrange, combo, storm, etc.).\n\n' ||
  E'You explain at least one synergy chain, using wording like:\n' ||
  E'"X works with Y because…"\n' ||
  E'"A triggers B which enables C…"\n' ||
  E'"This combo functions when…"\n\n' ||
  E'You provide at least three specific, legal cards that fit:\n' ||
  E'the color identity\n' ||
  E'the format\n' ||
  E'the described archetype\n' ||
  E'the deck plan\n\n' ||
  E'Color identity must always be respected.\n\n' ||
  E'Format legality must always be respected (Commander banlist, Standard rotation, Modern legality, Brawl legality, etc.).\n\n' ||
  E'Your answer must address the user''s actual deck plan, not a generic structure.\n\n' ||
  E'You must NOT rely solely on a generic pillars list ("ramp / draw / removal / wincons").\n' ||
  E'These can be included only as support, never as the main structure.\n\n' ||
  E'Avoid all generic boilerplate or autopilot responses.\n\n' ||
  E'If the user provides insufficient detail, you MUST ask clarifying questions instead of guessing.\n\n' ||
  E'If any of these cannot be met, STOP and ask the user for clarification.\n' ||
  E'Do not produce a partial or generic answer.\n\n' ||
  E'🎯 DECK ANALYSIS — SPECIAL ENFORCEMENT LAYER\n\n' ||
  E'When performing deck_analysis, the answer must additionally include:\n\n' ||
  E'A problems-first structure:\n' ||
  E'Start by listing weaknesses, bottlenecks, missing categories, curve gaps, or structural issues.\n' ||
  E'After identifying the problems, provide solutions and card suggestions.\n\n' ||
  E'Commander relevance:\n' ||
  E'Explain how the deck''s cards do or do not support the commander''s plan.\n' ||
  E'Mention the commander by name.\n' ||
  E'If the deck lacks synergy with the commander, you must explicitly say so.\n\n' ||
  E'Deck-plan validation:\n' ||
  E'You MUST comment on whether the decklist actually supports the stated plan (e.g. "landfall", "aristocrats", "superfriends", "tokens", etc.).\n\n' ||
  E'Category balance:\n' ||
  E'You must comment on whether the deck has sufficient:\n' ||
  E'ramp\n' ||
  E'card draw\n' ||
  E'interaction\n' ||
  E'win conditions\n' ||
  E'recursion\n' ||
  E'mana base quality\n' ||
  E'color fixing\n\n' ||
  E'Synergy chains (mandatory):\n' ||
  E'Provide at least one explicit synergy chain (e.g. "Sakura-Tribe Elder + Muldrotha + Ashnod''s Altar loops value because…").\n\n' ||
  E'Specificity requirement:\n' ||
  E'Provide at least 3 specific card suggestions tied directly to:\n' ||
  E'the deck plan\n' ||
  E'the commander\n' ||
  E'the archetype\n' ||
  E'the problems you identified\n\n' ||
  E'Legality enforcement:\n' ||
  E'You must:\n' ||
  E'Mention if any card in the deck is banned\n' ||
  E'Replace banned or illegal suggestions with legal alternatives\n' ||
  E'No hallucinated cards.\n' ||
  E'If uncertain, ask the user for clarification.',
  jsonb_build_object(
    'source', 'enforcement-layers',
    'description', 'Added global enforcement rules + deck analysis special enforcement layer',
    'improvements', jsonb_build_array('global_enforcement', 'deck_analysis_special', 'problems_first', 'commander_relevance', 'synergy_chains', 'specificity_requirement', 'legality_enforcement')
  ),
  NOW()
FROM prompt_versions
WHERE kind = 'deck_analysis'
ORDER BY created_at DESC
LIMIT 1
RETURNING id, version;

-- Set the new deck_analysis version as active
DO $$
DECLARE
  new_deck_version_id uuid;
  new_deck_version_name text;
BEGIN
  SELECT id, version INTO new_deck_version_id, new_deck_version_name
  FROM prompt_versions
  WHERE kind = 'deck_analysis'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF new_deck_version_id IS NOT NULL THEN
    INSERT INTO app_config (key, value)
    VALUES (
      'active_prompt_version_deck_analysis',
      jsonb_build_object('id', new_deck_version_id, 'version', new_deck_version_name)
    )
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('id', new_deck_version_id, 'version', new_deck_version_name);
    
    RAISE NOTICE 'Set % as active deck_analysis prompt', new_deck_version_name;
  END IF;
END $$;

