-- Changelog Update: April and May 2026 product updates
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New query)
-- Adds: mobile app development update + website tools/cards/AI improvements update

DO $$
DECLARE
  current_changelog JSONB;
  current_entries JSONB;
  existing_entries JSONB;
  april_entry JSONB;
  may_entry JSONB;
  updated_changelog JSONB;
BEGIN
  SELECT value INTO current_changelog
  FROM app_config
  WHERE key = 'changelog';

  current_entries := COALESCE(current_changelog->'entries', '[]'::jsonb);

  april_entry := jsonb_build_object(
    'version', 'April 2026',
    'date', '2026-04-30',
    'title', 'ManaTap mobile app: built for deck work anywhere',
    'type', 'feature',
    'description', 'The ManaTap mobile app moved deeper into active development in April. The goal is simple: make the best parts of ManaTap feel native, fast, and ready at the table, from card details to deck intelligence.',
    'features', jsonb_build_array(
      'Mobile-first card details - Open richer card views with legality, pricing, Scryfall links, and quick actions',
      'Explain this card - Ask ManaTap what a card does, where it fits, and how it plays, with deeper Pro explanations in progress',
      'App-native deck workflows - Continued work on smoother deck review, card actions, and AI-assisted decisions from your phone',
      'Foundation for launch - Built out the mobile control plane, app changelog tools, feature flags, and backend contracts needed for a reliable release',
      'Shared app and website plumbing - Card, price, and AI features are being wired so both experiences improve together'
    )
  );

  may_entry := jsonb_build_object(
    'version', 'May 2026',
    'date', '2026-05-25',
    'title', 'Tools Hub, richer card search, and stronger ManaTap AI',
    'type', 'feature',
    'description', 'May brings a bigger ManaTap command center for the website, cleaner card discovery, QR sharing, and deeper work across the AI routes that power deck building, analysis, card explanations, and the app experience.',
    'features', jsonb_build_array(
      'Tools Hub - A new premium /tools screen groups deck building, analysis, search, tracking, sharing, and fun table tools in one place',
      'Card Search command center - Search cards by name or natural language, open ManaTap card details, jump to Scryfall, track prices, and save cards faster',
      'Top Commander Cards refresh - The cards page now uses global meta signals, mini art previews, hover card images, and Scryfall price data',
      'AI route upgrades - Continued improvements to deck analysis, card explanation, compare, roast, and mobile AI grounding for clearer, more useful answers',
      'App development push - More backend and UX work landed to support the in-development ManaTap app alongside the website',
      'QR sharing and scanning - Share ManaTap links with QR codes and open shared decks, collections, reports, and cards from the new scan flow',
      'More consistent Pro and sign-in moments across tools, cards, price tracking, wishlist, and app-inspired actions'
    )
  );

  SELECT COALESCE(jsonb_agg(entry ORDER BY ordinality), '[]'::jsonb)
  INTO existing_entries
  FROM jsonb_array_elements(current_entries) WITH ORDINALITY AS t(entry, ordinality)
  WHERE entry->>'title' NOT IN (
    'ManaTap mobile app: built for deck work anywhere',
    'Tools Hub, richer card search, and stronger ManaTap AI'
  );

  updated_changelog := jsonb_build_object(
    'entries', jsonb_build_array(may_entry, april_entry) || existing_entries,
    'last_updated', NOW()::text
  );

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('changelog', updated_changelog, NOW())
  ON CONFLICT (key)
  DO UPDATE SET
    value = updated_changelog,
    updated_at = NOW();

  RAISE NOTICE 'Changelog updated: April and May 2026 product updates';
END $$;
