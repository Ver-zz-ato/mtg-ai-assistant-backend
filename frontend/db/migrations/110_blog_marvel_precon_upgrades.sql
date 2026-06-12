-- Optional: listing metadata for Marvel precon upgrade blog post in app_config (key: blog).
-- Full article remains in codebase: frontend/app/blog/[slug]/page.tsx (blogContent).
-- Apply manually in Supabase SQL Editor when you want /api/blog to include this row.
-- Drops prior row with the same slug (if any), then inserts at the top.

DO $$
DECLARE
  current_blog JSONB;
  entries_arr JSONB;
  filtered JSONB;
  marvel_precon JSONB := jsonb_build_object(
    'slug', 'upgrade-marvel-commander-precons-without-losing-theme',
    'title', 'How to Upgrade Marvel Commander Precons Without Losing the Theme',
    'excerpt', 'Marvel Commander precons are fun out of the box — but swapping in generic staples can flatten the deck''s identity. Upgrade in layers: fix the foundation, keep the story, sharpen interaction.',
    'date', '2026-06-12',
    'author', 'ManaTap Team',
    'category', 'Commander',
    'readTime', '8 min read',
    'gradient', 'from-red-600 via-blue-600 to-indigo-600',
    'icon', '🦸'
  );
  updated_blog JSONB;
BEGIN
  SELECT value INTO current_blog FROM app_config WHERE key = 'blog';

  IF current_blog IS NULL THEN
    updated_blog := jsonb_build_object(
      'entries',
      jsonb_build_array(marvel_precon),
      'last_updated', NOW()::text
    );
  ELSE
    entries_arr := COALESCE(current_blog->'entries', '[]'::jsonb);
    SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
    INTO filtered
    FROM jsonb_array_elements(entries_arr) WITH ORDINALITY AS t(elem, ord)
    WHERE (elem->>'slug') NOT IN (
      'upgrade-marvel-commander-precons-without-losing-theme'
    );

    updated_blog := jsonb_set(
      current_blog,
      '{entries}',
      jsonb_build_array(marvel_precon) || COALESCE(filtered, '[]'::jsonb)
    );
    updated_blog := jsonb_set(updated_blog, '{last_updated}', to_jsonb(NOW()::text));
  END IF;

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog', updated_blog, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  RAISE NOTICE 'Blog listing metadata updated (Marvel precon upgrades)';
END $$;
