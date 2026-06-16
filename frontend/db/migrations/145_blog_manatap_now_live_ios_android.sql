-- Publish blog: ManaTap Is Now Live on iOS & Android
-- Slug: manatap-now-live-ios-android
-- Run in Supabase SQL Editor (Dashboard). Do not run via MCP agents.

DO $$
DECLARE
  current_blog JSONB;
  current_bodies JSONB;
  new_entry JSONB;
  filtered JSONB;
  updated_blog JSONB;
  body_text TEXT := $body$# ManaTap Is Now Live on iOS & Android

After months of building, testing, bug fixing, and feedback from the MTG community, ManaTap is officially available on both the App Store and Google Play.

ManaTap was built to be the all-in-one companion for Magic: The Gathering players. Whether you're building a new Commander deck, looking for budget upgrades, analysing deck performance, tracking your collection, or asking MTG rules questions, ManaTap puts powerful tools in one place.

## What You Can Do With ManaTap

- Build decks with AI assistance
- Analyse deck strengths and weaknesses
- Compare multiple decks side-by-side
- Find budget card upgrades
- Scan and track your collection
- Ask MTG questions with AI Chat
- Use game-night tools like the Life Counter

## Download ManaTap

Ready to try it?

[Download ManaTap on iOS and Android](https://www.manatap.ai/get)

Or visit:

https://www.manatap.ai/get

## Thank You

Thank you to everyone who tested early builds, reported bugs, shared ideas, and helped shape ManaTap into what it is today.

This launch is only the beginning. More features, improvements, and MTG tools are already in development.

See you on the battlefield.$body$;
BEGIN
  new_entry := '{"slug":"manatap-now-live-ios-android","title":"ManaTap Is Now Live on iOS & Android","excerpt":"ManaTap is officially available on both the App Store and Google Play. Build better decks, get AI-powered MTG help, track your collection, and more.","date":"2026-06-16","author":"ManaTap Team","category":"Announcement","readTime":"3 min read","gradient":"from-blue-600 via-indigo-600 to-cyan-600","icon":"📱","imageUrl":"https://www.manatap.ai/blog-assets/manatap-store-badges.png"}'::jsonb;

  SELECT value INTO current_blog FROM app_config WHERE key = 'blog';

  IF current_blog IS NULL OR current_blog->'entries' IS NULL THEN
    updated_blog := jsonb_build_object(
      'entries', jsonb_build_array(new_entry),
      'last_updated', NOW()::text
    );
  ELSE
    SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
    INTO filtered
    FROM jsonb_array_elements(current_blog->'entries') WITH ORDINALITY AS t(elem, ord)
    WHERE (elem->>'slug') <> 'manatap-now-live-ios-android';

    updated_blog := jsonb_set(
      current_blog,
      '{entries}',
      jsonb_build_array(new_entry) || COALESCE(filtered, '[]'::jsonb)
    );
    updated_blog := jsonb_set(updated_blog, '{last_updated}', to_jsonb(NOW()::text));
  END IF;

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog', updated_blog, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  SELECT value INTO current_bodies FROM app_config WHERE key = 'blog_marketing_bodies';

  IF current_bodies IS NULL THEN
    current_bodies := '{}'::jsonb;
  END IF;

  current_bodies := jsonb_set(current_bodies, ARRAY['manatap-now-live-ios-android'], to_jsonb(body_text));

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('blog_marketing_bodies', current_bodies, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  RAISE NOTICE 'Blog published: /blog/manatap-now-live-ios-android';
END $$;
