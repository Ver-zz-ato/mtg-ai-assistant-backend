-- Marketing Radar: fix broken RSS URLs, YouTube channel IDs, enable working feeds.

-- MTG Official RSS is retired (404 / redirects to corporate site).
UPDATE public.marketing_sources
SET
  enabled = false,
  fetch_error = NULL,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'disabled_reason',
    'Wizards RSS retired (404). Use EDHREC, Commanders Herald, or manual paste.'
  )
WHERE type = 'rss' AND name = 'MTG Official News';

-- MTGGoldfish uses Atom at /feed (not /articles/feed).
UPDATE public.marketing_sources
SET
  url = 'https://www.mtggoldfish.com/feed',
  enabled = true,
  fetch_error = NULL
WHERE type = 'rss' AND name = 'MTGGoldfish Articles';

-- Commanders Herald feed verified.
UPDATE public.marketing_sources
SET
  enabled = true,
  fetch_error = NULL
WHERE type = 'rss' AND name = 'Commanders Herald';

-- YouTube channel IDs (resolved via YouTube Data API forHandle, 2026-06).
UPDATE public.marketing_sources
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"channelId": "UCLsiaNUb42gRAP7ewbJ0ecQ", "handle": "@commandcast"}'::jsonb,
    fetch_error = NULL
WHERE type = 'youtube_channel' AND name = 'The Command Zone';

UPDATE public.marketing_sources
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"channelId": "UC7-hR5EfgpM6oHfiGDkxfMA", "handle": "@tolariancommunitycollege"}'::jsonb,
    fetch_error = NULL
WHERE type = 'youtube_channel' AND name = 'Tolarian Community College';

UPDATE public.marketing_sources
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"channelId": "UCZAZTSd0xnor7hJFmINIBIw", "handle": "@mtggoldfish"}'::jsonb,
    fetch_error = NULL
WHERE type = 'youtube_channel' AND name = 'MTGGoldfish';

UPDATE public.marketing_sources
SET
  name = 'EDHRECast',
  url = 'https://www.youtube.com/@EDHRECast',
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"channelId": "UCApiDwDpn_JpzRGLZKrdr1g", "channelName": "EDHRECast", "handle": "@EDHRECast"}'::jsonb,
  fetch_error = NULL
WHERE type = 'youtube_channel' AND name = 'EDHREC';

UPDATE public.marketing_sources
SET
  name = 'Nitpicking Nerds',
  url = 'https://www.youtube.com/@NitpickingNerds',
  enabled = true,
  metadata = '{"channelId": "UCh76d0-ff5eaN68V2OaoghA", "channelName": "Nitpicking Nerds", "handle": "@NitpickingNerds", "priority": 3}'::jsonb,
  fetch_error = NULL
WHERE type = 'youtube_channel' AND name = 'Nitrogen';
