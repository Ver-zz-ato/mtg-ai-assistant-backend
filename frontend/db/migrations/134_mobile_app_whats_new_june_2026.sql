-- Mobile app What's New: June 2026 live play and tournament update.
-- Seeds app_changelog rows used by GET /api/mobile/bootstrap.

INSERT INTO public.app_changelog (
  id,
  title,
  body,
  platform,
  min_app_version,
  is_active,
  priority,
  starts_at
)
VALUES
  (
    'a0000000-0000-4000-8000-000000000134'::uuid,
    'Tournament Mode is here',
    'Host a Magic event from your phone, invite players with a QR or link, collect deck submissions, pair rounds, report results, and keep the event moving.',
    'mobile',
    '1.0.68',
    true,
    1,
    now()
  ),
  (
    'a0000000-0000-4000-8000-000000000135'::uuid,
    'Deck Compare reads more of the table',
    'Compare your own decks with other players'' public ManaTap decks, then check pod power and table balance before game one.',
    'mobile',
    '1.0.68',
    true,
    2,
    now()
  ),
  (
    'a0000000-0000-4000-8000-000000000136'::uuid,
    'Life Counter can sync live',
    'Start a shared Life Counter session, invite other devices with a QR or link, and keep everyone following the same game state.',
    'mobile',
    '1.0.68',
    true,
    3,
    now()
  )
ON CONFLICT (id)
DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  platform = EXCLUDED.platform,
  min_app_version = EXCLUDED.min_app_version,
  is_active = EXCLUDED.is_active,
  priority = EXCLUDED.priority,
  starts_at = COALESCE(public.app_changelog.starts_at, EXCLUDED.starts_at),
  updated_at = now();
