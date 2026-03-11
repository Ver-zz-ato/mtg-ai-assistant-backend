-- Changelog + Blog Update: March 2025 - Deck building upgrades
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Adds: Finish Deck, Build from Collection, smarter Card Suggestions

-- ============ CHANGELOG ============
DO $$
DECLARE
  current_changelog JSONB;
  new_entry JSONB;
  updated_changelog JSONB;
BEGIN
  SELECT value INTO current_changelog
  FROM app_config
  WHERE key = 'changelog';

  new_entry := jsonb_build_object(
    'version', 'March 2025',
    'date', '2025-03-06',
    'title', 'Deck building upgrades: Finish Deck, Build from Collection & smarter suggestions',
    'type', 'feature',
    'description', 'We''ve added several deck-building improvements: Finish This Deck (AI suggests cards to reach 100), Build Deck From Collection with preview-before-create, and smarter Card Suggestions that follow color identity with hover-to-preview.',
    'features', jsonb_build_array(
      'Finish This Deck — AI suggests cards to fill gaps (Build Assistant + insufficient-cards banner)',
      'Build Deck From Collection — Generate Commander decks from your cards; preview modal before creating',
      'AI Deck Generator (Commander page) — Same preview flow for modules A/B/C/D',
      'Card Suggestions — Now respect Commander color identity; hover art for full image popup'
    ),
    'fixes', jsonb_build_array(
      'AI deck generation now enforces exactly 100 cards and strict color identity',
      'Removed History/Undo/Redo from Build Assistant panel'
    )
  );

  IF current_changelog IS NULL OR current_changelog->'entries' IS NULL THEN
    updated_changelog := jsonb_build_object(
      'entries', jsonb_build_array(new_entry),
      'last_updated', NOW()::text
    );
  ELSE
    updated_changelog := jsonb_set(
      current_changelog,
      '{entries}',
      jsonb_build_array(new_entry) || (current_changelog->'entries')
    );
    updated_changelog := jsonb_set(
      updated_changelog,
      '{last_updated}',
      to_jsonb(NOW()::text)
    );
  END IF;

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('changelog', updated_changelog, NOW())
  ON CONFLICT (key)
  DO UPDATE SET
    value = updated_changelog,
    updated_at = NOW();

  RAISE NOTICE 'Changelog updated: March 2025 deck building upgrades';
END $$;

-- ============ BLOG ============
DO $$
DECLARE
  current_blog JSONB;
  new_entry JSONB;
  updated_blog JSONB;
BEGIN
  SELECT value INTO current_blog
  FROM app_config
  WHERE key = 'blog';

  new_entry := jsonb_build_object(
    'slug', 'deck-building-upgrades-march-2025',
    'title', '✨ New Deck Building Features: Finish This Deck, Build From Collection & Smarter AI',
    'excerpt', 'AI now helps you complete partial decks, generate Commander decks from your collection with a preview step, and gives color-identity–compliant card suggestions with hover previews.',
    'date', '2025-03-06',
    'author', 'ManaTap Team',
    'category', 'Announcement',
    'readTime', '6 min read',
    'gradient', 'from-purple-600 via-pink-600 to-rose-600',
    'icon', '✨'
  );

  IF current_blog IS NULL OR current_blog->'entries' IS NULL THEN
    updated_blog := jsonb_build_object(
      'entries', jsonb_build_array(new_entry),
      'last_updated', NOW()::text
    );
  ELSE
    updated_blog := jsonb_set(
      current_blog,
      '{entries}',
      jsonb_build_array(new_entry) || (current_blog->'entries')
    );
    updated_blog := jsonb_set(
      updated_blog,
      '{last_updated}',
      to_jsonb(NOW()::text)
    );
  END IF;

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog', updated_blog, NOW())
  ON CONFLICT (key)
  DO UPDATE SET
    value = updated_blog,
    updated_at = NOW();

  RAISE NOTICE 'Blog updated: deck-building-upgrades-march-2025';
END $$;
