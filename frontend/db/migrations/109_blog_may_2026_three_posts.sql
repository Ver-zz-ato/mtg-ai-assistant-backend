-- Optional: listing metadata for three May 2026 blog posts in app_config (key: blog).
-- Full articles remain in codebase: frontend/app/blog/[slug]/page.tsx (blogContent).
-- Apply manually in Supabase SQL Editor when you want /api/blog to include these rows.
-- Drops prior rows with the same slugs (if any), then inserts these three at the top.

DO $$
DECLARE
  current_blog JSONB;
  entries_arr JSONB;
  filtered JSONB;
  roast JSONB := jsonb_build_object(
    'slug', 'roast-my-deck-funniest-deckbuilding-fails',
    'title', '🔥 Roast My Deck: The Funniest Commander Deckbuilding Fails We See All the Time',
    'excerpt', 'Some decks are tuned machines. Others are 37 seven-drops, 4 lands, and a dream. Let''s talk about the mistakes ManaTap loves roasting.',
    'date', '2026-05-08',
    'author', 'ManaTap Team',
    'category', 'Strategy',
    'readTime', '5 min read',
    'gradient', 'from-orange-600 via-red-600 to-rose-600',
    'icon', '🔥'
  );
  lands JSONB := jsonb_build_object(
    'slug', 'commander-land-count-guide',
    'title', 'Commander Land Count: How Many Lands Should You Actually Run?',
    'excerpt', 'Most Commander decks don''t lose because they flooded. They lose because they never got to play Magic in the first four turns.',
    'date', '2026-05-08',
    'author', 'ManaTap Team',
    'category', 'Commander',
    'readTime', '7 min read',
    'gradient', 'from-sky-600 via-blue-600 to-cyan-600',
    'icon', '🌍'
  );
  mistakes JSONB := jsonb_build_object(
    'slug', 'commander-deckbuilding-mistakes',
    'title', '7 Commander Deckbuilding Mistakes That Secretly Ruin Your Games',
    'excerpt', 'Most Commander decks don''t fail because of one bad card — they fail because small consistency problems stack up every game.',
    'date', '2026-05-08',
    'author', 'ManaTap Team',
    'category', 'Strategy',
    'readTime', '6 min read',
    'gradient', 'from-rose-600 via-red-600 to-orange-600',
    'icon', '⚠️'
  );
  updated_blog JSONB;
BEGIN
  SELECT value INTO current_blog FROM app_config WHERE key = 'blog';

  IF current_blog IS NULL THEN
    updated_blog := jsonb_build_object(
      'entries',
      jsonb_build_array(roast, lands, mistakes),
      'last_updated', NOW()::text
    );
  ELSE
    entries_arr := COALESCE(current_blog->'entries', '[]'::jsonb);
    SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
    INTO filtered
    FROM jsonb_array_elements(entries_arr) WITH ORDINALITY AS t(elem, ord)
    WHERE (elem->>'slug') NOT IN (
      'roast-my-deck-funniest-deckbuilding-fails',
      'commander-land-count-guide',
      'commander-deckbuilding-mistakes'
    );

    updated_blog := jsonb_set(
      current_blog,
      '{entries}',
      jsonb_build_array(roast, lands, mistakes) || COALESCE(filtered, '[]'::jsonb)
    );
    updated_blog := jsonb_set(updated_blog, '{last_updated}', to_jsonb(NOW()::text));
  END IF;

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog', updated_blog, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  RAISE NOTICE 'Blog listing metadata updated (May 2026: 3 posts)';
END $$;
