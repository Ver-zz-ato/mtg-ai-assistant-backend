-- Changelog Update: Budget Swaps Visual Overhaul (Oct 26, 2025)
-- Run this in Supabase SQL Editor to add the new changelog entry

-- First, fetch the current changelog
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

  -- Create new entry for Budget Swaps overhaul
  new_entry := jsonb_build_object(
    'version', 'v1.8.0',
    'date', '2025-10-26',
    'title', 'Budget Swaps Visual Overhaul',
    'description', 'Complete redesign of the Budget Swaps tool with beautiful animations, batch operations, and enhanced UX',
    'features', jsonb_build_array(
      'Beautiful card-based grid layout with before/after comparison',
      'Batch selection with floating action bar for multi-swap operations',
      'Deck forking - apply selected swaps to create new optimized deck',
      'Commander art banner showing deck context with color identity',
      'Animated header with mana-colored background blobs'
    ),
    'improvements', jsonb_build_array(
      'Progressive loading animations for smooth card reveals',
      'Mana-colored glows on summary cards based on savings (green/amber/red)',
      'Quick-start tutorial with 3-step guide in empty state',
      'Enhanced copywriting with playful, professional tagline',
      'Success modal with animated feedback when forking decks'
    )
  );

  -- Prepend new entry to existing entries array
  updated_changelog := jsonb_set(
    current_changelog,
    '{entries}',
    new_entry || (current_changelog->'entries')
  );

  -- Update the changelog
  UPDATE app_config
  SET value = updated_changelog,
      updated_at = NOW()
  WHERE key = 'changelog';

  RAISE NOTICE 'Changelog updated successfully with Budget Swaps v1.8.0 entry';
END $$;

