-- Add only the "Roast My Deck" blog entry to app_config (key: blog).
-- Run in Supabase: Dashboard → SQL Editor → New query → Paste & Run.
-- Idempotent: if an entry with slug 'roast-my-deck' already exists, it is updated; otherwise prepended.

DO $$
DECLARE
  current_blog JSONB;
  new_entry JSONB;
  updated_blog JSONB;
  existing_idx INT;
  entries_arr JSONB;
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
    entries_arr := current_blog->'entries';
    -- Find existing index of roast-my-deck (if any)
    SELECT i INTO existing_idx
    FROM jsonb_array_elements(entries_arr) WITH ORDINALITY AS t(e, i)
    WHERE (e->>'slug') = 'roast-my-deck'
    LIMIT 1;
    IF existing_idx IS NOT NULL THEN
      -- Replace existing entry
      updated_blog := jsonb_set(
        current_blog,
        array['entries', (existing_idx - 1)::text],
        new_entry
      );
    ELSE
      -- Prepend new entry
      updated_blog := jsonb_set(
        current_blog,
        '{entries}',
        jsonb_build_array(new_entry) || entries_arr
      );
    END IF;
    updated_blog := jsonb_set(updated_blog, '{last_updated}', to_jsonb(NOW()::text));
  END IF;

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog', updated_blog, NOW())
  ON CONFLICT (key)
  DO UPDATE SET value = updated_blog, updated_at = NOW();

  RAISE NOTICE 'Blog updated: roast-my-deck entry added/updated';
END $$;
