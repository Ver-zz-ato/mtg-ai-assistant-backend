-- Add v1.2.0 changelog entry
-- Run this in your Supabase SQL editor

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
  
  -- Create new entry (using today's date so it appears at the top)
  new_entry := '{
    "version": "v1.2.0",
    "date": "2026-01-03",
    "title": "Better User Experience & Bug Fixes",
    "type": "improvement",
    "description": "This update focuses on making ManaTap more reliable and user-friendly. We''ve fixed important bugs, improved the signup experience, and added helpful visual feedback to make your deck-building journey smoother.",
    "features": [
      "💎 Easier Sign-Up: New prominent signup banners and helpful prompts make it easier to create your account and start saving your decks",
      "📊 Better Guest Mode Feedback: Clear progress bars and visual indicators show exactly how many messages you have left, so you know when to sign up to save your progress",
      "✨ Enhanced Visual Design: Improved mobile layouts, better button styling, and clearer visual hierarchy throughout the app for a more polished experience",
      "🎯 Improved Social Proof: Enhanced live activity indicators show a more active community, making it clear you''re joining an engaged MTG community",
      "📱 Better Mobile Experience: Optimized layouts and interactions for mobile devices so you can build decks on the go"
    ],
    "fixes": [
      "🔧 Fixed watchlist price display - Your watchlist now correctly shows current card prices from Scryfall instead of showing \"No price data\"",
      "🐛 Fixed session stability issues that could cause unexpected logouts or UI glitches",
      "⚡ Improved price loading reliability - Watchlist sidebar on the price tracker page now loads prices more consistently"
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
