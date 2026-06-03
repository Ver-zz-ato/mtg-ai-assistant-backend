-- Changelog Update: ManaTap mobile app Android/iOS progress
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- Adds a public website What's New entry highlighting May 2026 app progress.

DO $$
DECLARE
  current_changelog JSONB;
  current_entries JSONB;
  existing_entries JSONB;
  app_entry JSONB;
  updated_changelog JSONB;
BEGIN
  SELECT value INTO current_changelog
  FROM app_config
  WHERE key = 'changelog';

  current_entries := COALESCE(current_changelog->'entries', '[]'::jsonb);

  app_entry := jsonb_build_object(
    'version', 'May 2026',
    'date', '2026-05-31',
    'title', 'ManaTap mobile app is getting close',
    'type', 'feature',
    'description', 'May was a big month for the ManaTap app. The Android and iOS experience is coming together fast: scanner work, deck building, collection tools, table-side play helpers, and guest flows are now much closer to feeling like one polished native companion for Magic players.',
    'features', jsonb_build_array(
      'Android and iOS launch polish - The app is being tuned across both platforms, with safer keyboard handling, cleaner setup screens, smoother navigation, and fewer rough edges before release',
      'Faster card scanning - The scanner received major work around live capture, lighting, torch behavior, scan results, recent cards, and AI Assist for tougher recognition moments',
      'Build from your collection - Players can turn real owned cards into decks with manual brewing, AI drafts, Playstyle Quiz handoff, owned-card summaries, and clearer missing-card guidance',
      'Voice-ready Life Counter - Table tracking now supports voice commands, sound feedback, clearer setup controls, and better matching when player names are misheard',
      'Better collection and wishlist management - Imports, scan entry points, editing, card rows, quantities, and filters are more app-like and easier to use on a phone',
      'Guest deck building - New players can start building before signing in, then save their draft later without losing progress',
      'Smarter deck chat and feedback - Deck chat can apply and undo changes, refresh the deck after edits, and collect clearer feedback when AI answers need reporting'
    ),
    'fixes', jsonb_build_array(
      'Smoother loading, clearer prompts, and more reliable flows across decks, tools, auth, sharing, and app analytics'
    )
  );

  SELECT COALESCE(jsonb_agg(entry ORDER BY ordinality), '[]'::jsonb)
  INTO existing_entries
  FROM jsonb_array_elements(current_entries) WITH ORDINALITY AS t(entry, ordinality)
  WHERE entry->>'title' <> 'ManaTap mobile app is getting close';

  updated_changelog := jsonb_build_object(
    'entries', jsonb_build_array(app_entry) || existing_entries,
    'last_updated', NOW()::text
  );

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('changelog', updated_changelog, NOW())
  ON CONFLICT (key)
  DO UPDATE SET
    value = updated_changelog,
    updated_at = NOW();

  RAISE NOTICE 'Changelog updated: ManaTap mobile app Android/iOS progress';
END $$;
