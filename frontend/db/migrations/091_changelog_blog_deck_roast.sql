-- Changelog + Blog Update: Deck Roast feature
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Adds: Roast My Deck (AI deck roast with shareable permalinks)

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
    'date', '2025-03-15',
    'title', 'Roast My Deck: AI deck roast with shareable links',
    'type', 'feature',
    'description', 'Paste or upload a deck and get a fun, AI-powered roast. Choose your heat: Gentle, Balanced, Spicy, or Savage. Logged-in users can save a roast and share a permanent link so friends can see it.',
    'features', jsonb_build_array(
      'Roast My Deck — Paste decklist or upload a file; AI roasts your deck with humor and real feedback',
      'Four roast levels — Gentle 🟢, Balanced 🟡, Spicy 🌶, Savage 🔥',
      'Shareable permalinks — Save a roast and share a link (e.g. /roast/[id]) so anyone can view it',
      'Commander art and card hover — Roast page shows commander art; card names in the roast support hover preview'
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

  RAISE NOTICE 'Changelog updated: Deck Roast feature';
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
    'slug', 'roast-my-deck',
    'title', '🔥 Roast My Deck: Get Your Deck Roasted by AI (And Share It)',
    'excerpt', 'Paste your decklist, pick your heat level, and let the AI roast your deck — then save and share a permanent link so your playgroup can see it.',
    'date', '2025-03-15',
    'author', 'ManaTap Team',
    'category', 'Announcement',
    'readTime', '5 min read',
    'gradient', 'from-amber-600 via-orange-600 to-rose-600',
    'icon', '🔥'
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

  RAISE NOTICE 'Blog updated: roast-my-deck';
END $$;
