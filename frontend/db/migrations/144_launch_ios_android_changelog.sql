-- Launch changelog: ManaTap is live on iOS and Android.
-- Adds website /changelog entry and mobile What's New bootstrap row.

DO $$
DECLARE
  current_changelog jsonb;
  current_entries jsonb;
  existing_entries jsonb;
  launch_entry jsonb;
  updated_changelog jsonb;
BEGIN
  SELECT value INTO current_changelog
  FROM app_config
  WHERE key = 'changelog';

  current_entries := COALESCE(current_changelog->'entries', '[]'::jsonb);

  launch_entry := jsonb_build_object(
    'version', 'Launch 2026',
    'date', '2026-06-16',
    'title', 'ManaTap is now available on iOS & Android',
    'type', 'feature',
    'description', 'ManaTap is officially live on both the App Store and Google Play. Build better decks, analyze strategies, discover budget upgrades, chat with MTG AI, track your collection, and more from one app.',
    'features', jsonb_build_array(
      'Download ManaTap from the App Store and Google Play.',
      'Build decks, analyze strategies, discover budget upgrades, chat with MTG AI, and track your collection from one app.',
      'Thank you to everyone who tested, reported bugs, and shared feedback. This is just the beginning.'
    ),
    'fixes', jsonb_build_array()
  );

  SELECT COALESCE(jsonb_agg(entry ORDER BY ordinality), '[]'::jsonb)
  INTO existing_entries
  FROM jsonb_array_elements(current_entries) WITH ORDINALITY AS t(entry, ordinality)
  WHERE entry->>'title' <> 'ManaTap is now available on iOS & Android';

  updated_changelog := jsonb_build_object(
    'entries', jsonb_build_array(launch_entry) || existing_entries,
    'last_updated', now()::text
  );

  INSERT INTO app_config (key, value, updated_at)
  VALUES ('changelog', updated_changelog, now())
  ON CONFLICT (key)
  DO UPDATE SET value = updated_changelog, updated_at = now();
END $$;

INSERT INTO public.app_changelog (
  id,
  title,
  body,
  platform,
  min_app_version,
  max_app_version,
  is_active,
  priority,
  starts_at
)
VALUES (
  'a0000000-0000-4000-8000-000000000144'::uuid,
  'ManaTap is live on iOS & Android',
  'ManaTap is officially available on the App Store and Google Play. Build decks, analyze strategies, find budget upgrades, chat with MTG AI, track your collection, and more from one app. Thank you for testing, reporting bugs, and sharing feedback.',
  'mobile',
  null,
  null,
  true,
  0,
  now()
)
ON CONFLICT (id)
DO UPDATE SET
  title = excluded.title,
  body = excluded.body,
  platform = excluded.platform,
  min_app_version = excluded.min_app_version,
  max_app_version = excluded.max_app_version,
  is_active = excluded.is_active,
  priority = excluded.priority,
  starts_at = COALESCE(public.app_changelog.starts_at, excluded.starts_at),
  updated_at = now();
