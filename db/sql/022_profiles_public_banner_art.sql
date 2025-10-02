-- 022_profiles_public_banner_art.sql
-- Adds a cached banner art URL to public profiles for faster loads
BEGIN;

ALTER TABLE public.profiles_public
  ADD COLUMN IF NOT EXISTS banner_art_url text;

COMMIT;