-- APP ONLY What's New (mobile app changelog)
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Purpose: Creates the app_config row for 'app_changelog' used by the
--          ManaTap mobile app (hamburger menu → What's New).
--          Separate from website changelog (key 'changelog').
--
-- After this: Use admin page manatap.ai/admin/JustForDavy/app-whats-new
--             to build entries and Generate SQL for adding new updates.

INSERT INTO app_config (key, value, updated_at)
VALUES (
  'app_changelog',
  '{"entries":[]}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
