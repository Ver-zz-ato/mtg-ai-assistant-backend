-- Add new blog post and changelog entry
-- Run this in your Supabase SQL editor

-- Update changelog: Add v1.1.0 entry
-- First, get existing entries and add the new one
DO $$
DECLARE
  existing_value jsonb;
  new_entry jsonb;
  all_entries jsonb;
BEGIN
  -- Get existing changelog
  SELECT value INTO existing_value
  FROM app_config
  WHERE key = 'changelog';
  
  -- Create new entry
  new_entry := '{
    "version": "v1.1.0",
    "date": "2025-11-26",
    "title": "AI Improvements & Smarter Deck Analysis",
    "type": "improvement",
    "description": "Over the past 23 days of soft launch, ManaTap''s AI has received a major upgrade. Thanks to real user decks, bug reports, and thousands of test cases, the deck assistant is now significantly smarter, faster, and more accurate across all formats.",
    "features": [
      "Massively improved archetype recognition - The AI is now better at identifying your deck''s real plan (tokens, aristocrats, landfall, enchantress, spellslinger, lifegain, etc.)",
      "Better synergy-driven suggestions - Card recommendations now stay on-theme more consistently, with clearer relevance to your commander or strategy",
      "Stronger format + legality awareness - Fewer off-color suggestions, fewer banned cards, and improved context for Commander, Modern, and Standard",
      "Cleaner ramp categorization - The assistant reliably distinguishes between land ramp, mana rocks, and dorks — no more mislabelled cards like Fabled Passage",
      "Improved budget reasoning - Suggestions now include clearer notes on price, cheaper alternatives, and upgrade paths",
      "Better explanations overall - AI responses now include more structured reasoning and clearer \"why this card?\" breakdowns",
      "Faster combo and interaction detection - Improved speed, fewer false positives, and more accurate spotting of two- and three-card synergies"
    ],
    "fixes": [
      "Dozens of live-user bug reports resolved",
      "Improved internal test coverage",
      "More consistent language, fewer contradictions across prompts"
    ]
  }'::jsonb;
  
  -- Combine existing entries with new one
  IF existing_value IS NULL OR existing_value->'entries' IS NULL THEN
    all_entries := jsonb_build_array(new_entry);
  ELSE
    all_entries := (existing_value->'entries') || new_entry;
    -- Sort by date descending
    all_entries := (
      SELECT jsonb_agg(entry ORDER BY (entry->>'date') DESC)
      FROM jsonb_array_elements(all_entries) AS entry
    );
  END IF;
  
  -- Update or insert
  INSERT INTO app_config (key, value, updated_at)
  VALUES (
    'changelog',
    jsonb_build_object(
      'entries', all_entries,
      'last_updated', NOW()::text
    ),
    NOW()
  )
  ON CONFLICT (key)
  DO UPDATE SET
    value = jsonb_build_object(
      'entries', all_entries,
      'last_updated', NOW()::text
    ),
    updated_at = NOW();
END $$;

