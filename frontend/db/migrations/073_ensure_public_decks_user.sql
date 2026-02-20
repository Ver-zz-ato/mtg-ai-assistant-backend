-- Ensure the public decks system user exists in auth.users.
-- Required for bulk import (discover, fetch-from-urls, bulk-import, discover-by-format).
-- If the user doesn't exist, inserts into decks will fail with FK violation.
-- Uses same instance_id as existing users; run via Supabase SQL editor or migration.

DO $$
DECLARE
  inst_id uuid;
BEGIN
  SELECT instance_id INTO inst_id FROM auth.users LIMIT 1;
  IF inst_id IS NULL THEN
    inst_id := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    aud
  )
  SELECT
    'b8c7d6e5-f4a3-4210-9d00-000000000001'::uuid,
    inst_id,
    'public-decks@system.manatap.ai',
    crypt('unused-system-user', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    'authenticated',
    'authenticated'
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = 'b8c7d6e5-f4a3-4210-9d00-000000000001'::uuid
  );
END $$;
