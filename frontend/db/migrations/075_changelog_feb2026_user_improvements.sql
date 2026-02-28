-- Changelog Update: February 2026 - User Improvements & Free Features
-- Run this in Supabase SQL Editor to add the new changelog entry

DO $$
DECLARE
  current_changelog JSONB;
  new_entry JSONB;
  updated_changelog JSONB;
BEGIN
  -- Get current changelog
  SELECT value INTO current_changelog
  FROM app_config
  WHERE key = 'changelog';

  -- Create new entry
  new_entry := jsonb_build_object(
    'version', 'v1.12.0',
    'date', '2026-02-26',
    'title', 'Free Card Fixes & Community Features',
    'type', 'feature',
    'description', 'Based on your feedback, we''ve made Fix Card Names completely free for everyone! Plus new community features, admin analytics, and dozens of bug fixes to make ManaTap smoother than ever.',
    'features', jsonb_build_array(
      '✨ Fix Card Names is now FREE - Match imported cards to our database at no cost, unlocking images, prices, and AI analysis',
      '💬 Live Shoutbox - Real-time community chat on the homepage with AI-powered conversation to keep things lively',
      '📊 Pro Gate Analytics - New admin dashboard to track conversion funnels and user journeys (internal)',
      '🔔 Smarter Import Prompts - After CSV import, get instant alerts if cards need fixing with one-click access'
    ),
    'improvements', jsonb_build_array(
      'More prominent unrecognized card banners - Never miss cards that need attention',
      'Streamlined fix modal UI - Cleaner design with better visual feedback',
      'Faster fuzzy matching - Improved card name suggestions powered by local cache',
      'Better import flow - See exactly what was matched and what needs review'
    ),
    'fixes', jsonb_build_array(
      'Fixed build cache corruption issues causing module errors',
      'Resolved port conflicts when running development server',
      'Fixed SSE connection stability for real-time features',
      'Corrected rate limiting edge cases for heavy API usage',
      'Dozens of UI polish fixes across deck editor and collection pages',
      'Improved error handling throughout the application'
    )
  );

  -- Prepend new entry to existing entries array (newest first)
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

  -- Upsert the changelog
  INSERT INTO app_config (key, value, updated_at)
  VALUES ('changelog', updated_changelog, NOW())
  ON CONFLICT (key)
  DO UPDATE SET
    value = updated_changelog,
    updated_at = NOW();

  RAISE NOTICE 'Changelog updated successfully with v1.12.0 entry';
END $$;
